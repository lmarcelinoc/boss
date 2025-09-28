import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantContextService } from '../services/tenant-context.service';
import { 
  TENANT_SCOPED_KEY,
  TENANT_OWNER_ONLY_KEY,
  CROSS_TENANT_ACCESS_KEY
} from '../decorators/tenant-scoped.decorator';

/**
 * Tenant Scoped Guard
 * Enforces tenant scoping and validates tenant access permissions
 */
@Injectable()
export class TenantScopedGuard implements CanActivate {
  private readonly logger = new Logger(TenantScopedGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContextService: TenantContextService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Check if endpoint requires tenant scoping
    const isTenantScoped = this.reflector.getAllAndOverride<boolean>(
      TENANT_SCOPED_KEY,
      [context.getHandler(), context.getClass()]
    );

    // Check if endpoint requires tenant owner access
    const requiresTenantOwner = this.reflector.getAllAndOverride<boolean>(
      TENANT_OWNER_ONLY_KEY,
      [context.getHandler(), context.getClass()]
    );

    // Check if endpoint allows cross-tenant access
    const allowsCrossTenantAccess = this.reflector.getAllAndOverride<boolean>(
      CROSS_TENANT_ACCESS_KEY,
      [context.getHandler(), context.getClass()]
    );

    // If no tenant-specific requirements, allow access
    if (!isTenantScoped && !requiresTenantOwner && !allowsCrossTenantAccess) {
      return true;
    }

    // Ensure user is authenticated
    if (!user) {
      throw new ForbiddenException('Authentication required for tenant-scoped operations');
    }

    // Get tenant context
    const tenantContext = this.tenantContextService.getTenantContext();
    
    if (!tenantContext) {
      this.logger.warn(
        `No tenant context available for user ${user.id} accessing ${request.method} ${request.url}`
      );
      throw new BadRequestException('Tenant context not available');
    }

    // Validate tenant context matches user
    if (tenantContext.userId !== user.id) {
      this.logger.error(
        `Tenant context mismatch: context user ${tenantContext.userId} !== request user ${user.id}`
      );
      throw new ForbiddenException('Tenant context validation failed');
    }

    // Check for cross-tenant access (Super Admin only)
    if (allowsCrossTenantAccess) {
      const isSuperAdmin = tenantContext.userRoles?.includes('Super Admin');
      
      if (!isSuperAdmin) {
        this.logger.warn(
          `User ${user.id} attempted cross-tenant access without Super Admin privileges`
        );
        throw new ForbiddenException('Cross-tenant access requires Super Admin privileges');
      }
      
      this.logger.debug(
        `Super Admin ${user.email} granted cross-tenant access to ${request.method} ${request.url}`
      );
      return true;
    }

    // Validate tenant access
    await this.validateTenantAccess(request, tenantContext);

    // Check tenant owner requirement
    if (requiresTenantOwner) {
      const isTenantOwner = tenantContext.userRoles?.includes('Owner');
      const isSuperAdmin = tenantContext.userRoles?.includes('Super Admin');
      
      if (!isTenantOwner && !isSuperAdmin) {
        this.logger.warn(
          `User ${user.email} attempted tenant owner operation without proper privileges`
        );
        throw new ForbiddenException('This operation requires Tenant Owner privileges');
      }
    }

    this.logger.debug(
      `Tenant scoped access granted: ${user.email} in tenant ${tenantContext.tenantId}`
    );

    return true;
  }

  /**
   * Validate user's access to the tenant
   */
  private async validateTenantAccess(
    request: any, 
    tenantContext: any
  ): Promise<void> {
    const user = request.user;

    // Check if user belongs to the tenant
    if (user.tenantId !== tenantContext.tenantId) {
      this.logger.warn(
        `Tenant access violation: User ${user.id} (tenant ${user.tenantId}) tried to access tenant ${tenantContext.tenantId}`
      );
      throw new ForbiddenException('Access denied: User does not belong to this tenant');
    }

    // Check for tenant switching in URL parameters
    const urlTenantId = this.extractTenantIdFromRequest(request);
    if (urlTenantId && urlTenantId !== tenantContext.tenantId) {
      // Allow Super Admins to access other tenants
      const isSuperAdmin = tenantContext.userRoles?.includes('Super Admin');
      
      if (!isSuperAdmin) {
        this.logger.warn(
          `Unauthorized tenant switching attempt: ${user.email} tried to access tenant ${urlTenantId}`
        );
        throw new ForbiddenException('Unauthorized tenant access attempted');
      } else {
        this.logger.debug(
          `Super Admin ${user.email} accessing different tenant: ${urlTenantId}`
        );
      }
    }

    // Additional validation: Check if tenant is active
    // This would require a database call, so we'll skip it for performance
    // The tenant middleware should handle inactive tenants
  }

  /**
   * Extract tenant ID from request parameters or headers
   */
  private extractTenantIdFromRequest(request: any): string | null {
    // Check URL parameters
    if (request.params?.tenantId) {
      return request.params.tenantId;
    }

    // Check query parameters
    if (request.query?.tenantId) {
      return request.query.tenantId;
    }

    // Check headers
    if (request.headers['x-tenant-id']) {
      return request.headers['x-tenant-id'];
    }

    return null;
  }
}
