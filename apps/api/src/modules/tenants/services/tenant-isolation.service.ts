import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { TenantContextService } from './tenant-context.service';

/**
 * Tenant Isolation Service
 * Enforces multi-tenant data isolation at the application level
 */
@Injectable()
export class TenantIsolationService {
  private readonly logger = new Logger(TenantIsolationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService
  ) {}

  /**
   * Initialize tenant isolation middleware for Prisma
   */
  async initializeTenantIsolation(): Promise<void> {
    this.logger.log('🔐 Initializing tenant isolation middleware...');

    // Add Prisma middleware for automatic tenant scoping
    this.prisma.$use(async (params, next) => {
      return this.tenantIsolationMiddleware(params, next);
    });

    this.logger.log('✅ Tenant isolation middleware initialized');
  }

  /**
   * Prisma middleware to automatically scope queries by tenantId
   */
  private async tenantIsolationMiddleware(params: any, next: any) {
    const { model, action, args } = params;

    // List of models that should be tenant-scoped
    const tenantScopedModels = [
      'User',
      'File',
      'Notification', 
      'Subscription',
      'Team',
      'Invitation',
      'TenantFeatureFlag',
      'TenantUsage',
      'BulkImportJob',
      'UsageAnalytics',
      'AnalyticsAggregate',
      'AuditLog',
    ];

    // List of models that should NOT be tenant-scoped (system-wide)
    const globalModels = [
      'Role',
      'Permission',
      'RolePermission',
      'UserRole',
      'Plan',
      'Tenant', // Tenants themselves are not scoped by tenant
      'RefreshToken', // Refresh tokens are user-scoped, not tenant-scoped
      'Session', // Sessions are user-scoped, not tenant-scoped
    ];

    // Skip if not a tenant-scoped model
    if (!tenantScopedModels.includes(model) || globalModels.includes(model)) {
      return next(params);
    }

    // Skip for specific actions that don't need tenant scoping
    const skipActions = ['createMany', 'deleteMany', 'updateMany'];
    if (skipActions.includes(action)) {
      return next(params);
    }

    // Get current tenant context
    const currentTenantId = this.getCurrentTenantId();
    
    // Skip tenant scoping for system operations (when no tenant context)
    if (!currentTenantId) {
      this.logger.debug(`Skipping tenant scoping for ${model}.${action} - no tenant context`);
      return next(params);
    }

    // Apply tenant scoping based on action type
    switch (action) {
      case 'findFirst':
      case 'findUnique':
      case 'findMany':
      case 'count':
      case 'aggregate':
        // Add tenant filter to WHERE clause
        if (!args.where) {
          args.where = {};
        }
        
        // Only add tenantId filter if not already present
        if (!args.where.tenantId) {
          args.where.tenantId = currentTenantId;
          this.logger.debug(`Applied tenant filter to ${model}.${action}: tenantId=${currentTenantId}`);
        }
        break;

      case 'create':
        // Add tenantId to create data
        if (!args.data.tenantId) {
          args.data.tenantId = currentTenantId;
          this.logger.debug(`Applied tenant scoping to ${model}.${action}: tenantId=${currentTenantId}`);
        }
        break;

      case 'update':
        // Ensure update only affects records in current tenant
        if (!args.where) {
          args.where = {};
        }
        if (!args.where.tenantId) {
          args.where.tenantId = currentTenantId;
          this.logger.debug(`Applied tenant filter to ${model}.${action}: tenantId=${currentTenantId}`);
        }
        break;

      case 'delete':
        // Ensure delete only affects records in current tenant
        if (!args.where) {
          args.where = {};
        }
        if (!args.where.tenantId) {
          args.where.tenantId = currentTenantId;
          this.logger.debug(`Applied tenant filter to ${model}.${action}: tenantId=${currentTenantId}`);
        }
        break;

      case 'upsert':
        // Add tenantId to both where and create data
        if (!args.where.tenantId) {
          args.where.tenantId = currentTenantId;
        }
        if (!args.create.tenantId) {
          args.create.tenantId = currentTenantId;
        }
        this.logger.debug(`Applied tenant scoping to ${model}.${action}: tenantId=${currentTenantId}`);
        break;
    }

    return next(params);
  }

  /**
   * Get current tenant context from AsyncLocalStorage
   */
  private getCurrentTenantId(): string | null {
    return this.tenantContextService.getCurrentTenantId();
  }

  /**
   * Verify that a record belongs to the current tenant
   */
  async verifyTenantAccess(recordTenantId: string, currentTenantId: string): Promise<void> {
    if (recordTenantId !== currentTenantId) {
      this.logger.warn(
        `Tenant isolation violation: Attempted to access record from tenant ${recordTenantId} while in tenant ${currentTenantId}`
      );
      throw new ForbiddenException('Access denied: Record belongs to different tenant');
    }
  }

  /**
   * Create tenant-scoped query builder helper
   */
  createTenantScopedQuery<T>(model: string, tenantId: string, baseWhere: any = {}): any {
    return {
      ...baseWhere,
      tenantId,
    };
  }

  /**
   * Get tenant ID from user context
   */
  getTenantIdFromUser(user: any): string | null {
    return user?.tenantId || null;
  }

  /**
   * Validate that user belongs to tenant
   */
  async validateUserTenantAccess(userId: string, tenantId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { tenantId: true },
    });

    if (!user) {
      return false;
    }

    return user.tenantId === tenantId;
  }

  /**
   * Get all tenants a user belongs to (for multi-tenant users)
   */
  async getUserTenants(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { tenantId: true },
    });

    // For now, users belong to only one tenant
    // This could be extended to support users in multiple tenants
    return user?.tenantId ? [user.tenantId] : [];
  }

  /**
   * Switch user's active tenant context
   */
  async switchUserTenant(userId: string, newTenantId: string): Promise<void> {
    // First verify user has access to the new tenant
    const hasAccess = await this.validateUserTenantAccess(userId, newTenantId);
    
    if (!hasAccess) {
      throw new ForbiddenException('User does not have access to the specified tenant');
    }

    // In a multi-tenant system, this would update the user's active tenant
    // For now, we just validate access
    this.logger.log(`User ${userId} switched to tenant ${newTenantId}`);
  }

  /**
   * Create tenant-specific database connection or context
   */
  async createTenantContext(tenantId: string): Promise<any> {
    // Verify tenant exists and is active
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, isActive: true, name: true },
    });

    if (!tenant) {
      throw new ForbiddenException('Tenant not found');
    }

    if (!tenant.isActive) {
      throw new ForbiddenException('Tenant is not active');
    }

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      isActive: tenant.isActive,
    };
  }
}
