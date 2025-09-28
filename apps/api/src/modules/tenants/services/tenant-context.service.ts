import { Injectable, Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  tenantId: string;
  tenantName?: string;
  userId?: string;
  userEmail?: string;
  userRoles?: string[];
  requestId?: string;
}

/**
 * Tenant Context Service
 * Manages tenant context throughout the request lifecycle using AsyncLocalStorage
 */
@Injectable()
export class TenantContextService {
  private readonly logger = new Logger(TenantContextService.name);
  private readonly asyncLocalStorage = new AsyncLocalStorage<TenantContext>();

  /**
   * Set tenant context for the current request
   */
  setTenantContext(context: TenantContext): void {
    this.logger.debug(`Setting tenant context: ${context.tenantId} for user ${context.userId}`);
    
    // Store in AsyncLocalStorage
    this.asyncLocalStorage.enterWith(context);
  }

  /**
   * Get current tenant context
   */
  getTenantContext(): TenantContext | undefined {
    return this.asyncLocalStorage.getStore();
  }

  /**
   * Get current tenant ID
   */
  getCurrentTenantId(): string | null {
    const context = this.getTenantContext();
    return context?.tenantId || null;
  }

  /**
   * Get current user ID
   */
  getCurrentUserId(): string | null {
    const context = this.getTenantContext();
    return context?.userId || null;
  }

  /**
   * Get current user roles
   */
  getCurrentUserRoles(): string[] {
    const context = this.getTenantContext();
    return context?.userRoles || [];
  }

  /**
   * Check if current user has a specific role
   */
  hasRole(roleName: string): boolean {
    const roles = this.getCurrentUserRoles();
    return roles.includes(roleName);
  }

  /**
   * Check if current user has any of the specified roles
   */
  hasAnyRole(roleNames: string[]): boolean {
    const userRoles = this.getCurrentUserRoles();
    return roleNames.some(role => userRoles.includes(role));
  }

  /**
   * Check if current user is Super Admin
   */
  isSuperAdmin(): boolean {
    return this.hasRole('Super Admin');
  }

  /**
   * Check if current user is Tenant Owner
   */
  isTenantOwner(): boolean {
    return this.hasRole('Owner');
  }

  /**
   * Check if current user has admin privileges (Owner, Admin, or Super Admin)
   */
  hasAdminPrivileges(): boolean {
    return this.hasAnyRole(['Super Admin', 'Owner', 'Admin']);
  }

  /**
   * Run a function within a specific tenant context
   */
  async runWithTenantContext<T>(
    context: TenantContext,
    fn: () => Promise<T>
  ): Promise<T> {
    this.logger.debug(`Running function with tenant context: ${context.tenantId}`);
    
    return this.asyncLocalStorage.run(context, fn);
  }

  /**
   * Clear tenant context (useful for testing)
   */
  clearContext(): void {
    this.logger.debug('Clearing tenant context');
    this.asyncLocalStorage.disable();
  }

  /**
   * Create a child context with updated values
   */
  createChildContext(updates: Partial<TenantContext>): TenantContext {
    const currentContext = this.getTenantContext();
    
    return {
      ...currentContext,
      ...updates,
    } as TenantContext;
  }

  /**
   * Log current context for debugging
   */
  logCurrentContext(): void {
    const context = this.getTenantContext();
    
    if (context) {
      this.logger.debug('Current tenant context:', {
        tenantId: context.tenantId,
        tenantName: context.tenantName,
        userId: context.userId,
        userEmail: context.userEmail,
        userRoles: context.userRoles,
        requestId: context.requestId,
      });
    } else {
      this.logger.debug('No tenant context available');
    }
  }

  /**
   * Validate that we're in a proper tenant context
   */
  validateTenantContext(): void {
    const context = this.getTenantContext();
    
    if (!context) {
      throw new Error('No tenant context available');
    }
    
    if (!context.tenantId) {
      throw new Error('Tenant ID not available in context');
    }
    
    if (!context.userId) {
      throw new Error('User ID not available in context');
    }
  }

  /**
   * Get context summary for logging
   */
  getContextSummary(): string {
    const context = this.getTenantContext();
    
    if (!context) {
      return 'No context';
    }
    
    return `Tenant: ${context.tenantId}, User: ${context.userId} (${context.userEmail})`;
  }
}
