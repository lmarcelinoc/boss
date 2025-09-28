import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';

// Metadata keys for tenant scoping
export const TENANT_SCOPED_KEY = 'tenant_scoped';
export const TENANT_OWNER_ONLY_KEY = 'tenant_owner_only';
export const CROSS_TENANT_ACCESS_KEY = 'cross_tenant_access';

/**
 * Mark an endpoint as tenant-scoped
 * This ensures the request has proper tenant context
 */
export const TenantScoped = () => SetMetadata(TENANT_SCOPED_KEY, true);

/**
 * Mark an endpoint as requiring tenant owner privileges
 */
export const TenantOwnerOnly = () => SetMetadata(TENANT_OWNER_ONLY_KEY, true);

/**
 * Mark an endpoint as allowing cross-tenant access (Super Admin only)
 */
export const AllowCrossTenantAccess = () => SetMetadata(CROSS_TENANT_ACCESS_KEY, true);

/**
 * Parameter decorators to extract tenant context information
 */

/**
 * Get current tenant ID from request context
 */
export const CurrentTenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantId || request.tenantContext?.tenantId;
  },
);

/**
 * Get current tenant context from request
 */
export const CurrentTenantContext = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantContext;
  },
);

/**
 * Get current tenant name from request context
 */
export const CurrentTenantName = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantContext?.tenantName;
  },
);

/**
 * Check if current user is tenant owner
 */
export const IsTenantOwner = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const userRoles = request.tenantContext?.userRoles || [];
    return userRoles.includes('Owner');
  },
);

/**
 * Check if current user is tenant admin (Owner or Admin)
 */
export const IsTenantAdmin = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const userRoles = request.tenantContext?.userRoles || [];
    return userRoles.includes('Owner') || userRoles.includes('Admin');
  },
);

/**
 * Check if current user is Super Admin (cross-tenant access)
 */
export const IsSuperAdmin = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const userRoles = request.tenantContext?.userRoles || [];
    return userRoles.includes('Super Admin');
  },
);

/**
 * Combined decorators for common patterns
 */

/**
 * Decorator for endpoints that modify tenant data (requires Admin+)
 */
export const TenantAdminOperation = () => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    TenantScoped()(target, propertyKey, descriptor);
    // Additional logic could be added here
  };
};

/**
 * Decorator for endpoints that manage tenant settings (requires Owner+)
 */
export const TenantOwnerOperation = () => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    TenantScoped()(target, propertyKey, descriptor);
    TenantOwnerOnly()(target, propertyKey, descriptor);
  };
};

/**
 * Decorator for endpoints that can access cross-tenant data (Super Admin only)
 */
export const CrossTenantOperation = () => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    AllowCrossTenantAccess()(target, propertyKey, descriptor);
  };
};
