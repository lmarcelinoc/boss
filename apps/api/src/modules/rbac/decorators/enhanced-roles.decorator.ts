import { SetMetadata } from '@nestjs/common';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Role metadata key
export const ROLES_KEY = 'roles';
export const MIN_ROLE_LEVEL_KEY = 'min_role_level';

// Basic role decorator
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

// Level-based decorator (lower number = higher authority)
export const RequireMinLevel = (level: number) => SetMetadata(MIN_ROLE_LEVEL_KEY, level);

// Convenience decorators for specific roles
export const SuperAdminOnly = () => Roles('Super Admin');
export const OwnerOnly = () => Roles('Owner');
export const AdminOnly = () => Roles('Admin', 'Owner', 'Super Admin');
export const ManagerOnly = () => Roles('Manager', 'Admin', 'Owner', 'Super Admin');
export const MemberOnly = () => Roles('Member', 'Manager', 'Admin', 'Owner', 'Super Admin');
export const ViewerOnly = () => Roles('Viewer', 'Member', 'Manager', 'Admin', 'Owner', 'Super Admin');

// Level-based decorators (more flexible)
export const RequireSuperAdminLevel = () => RequireMinLevel(1); // Super Admin or Owner (level 1)
export const RequireOwnerLevel = () => RequireMinLevel(1);      // Super Admin or Owner (level 1) 
export const RequireAdminLevel = () => RequireMinLevel(2);      // Admin and above (level 1-2)
export const RequireManagerLevel = () => RequireMinLevel(3);    // Manager and above (level 1-3)
export const RequireMemberLevel = () => RequireMinLevel(4);     // Member and above (level 1-4)
export const RequireViewerLevel = () => RequireMinLevel(5);     // All authenticated users (level 1-5)

// Parameter decorators to extract user information
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

export const UserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.id;
  },
);

export const UserRoles = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.roles || [];
  },
);

export const UserTenant = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.tenantId;
  },
);

export const UserHighestRole = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.highestRole;
  },
);

export const UserPermissions = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.permissions || [];
  },
);

// Combined decorators for common use cases
export const RequireOwnerOrSuperAdmin = () => Roles('Owner', 'Super Admin');
export const RequireAdminOrAbove = () => Roles('Admin', 'Owner', 'Super Admin');
export const RequireManagerOrAbove = () => Roles('Manager', 'Admin', 'Owner', 'Super Admin');

// Sensitive operation decorators
export const RequireMfa = () => SetMetadata('require_mfa', true);
export const SensitiveOperation = () => SetMetadata('sensitive_operation', true);
export const HighPrivilegeOperation = () => SetMetadata('high_privilege_operation', true);

// System-only operations
export const SystemOperation = () => SetMetadata('system_operation', true);
export const PlatformAdminOnly = () => SuperAdminOnly();

// Tenant-specific operations
export const TenantOwnerOnly = () => SetMetadata('tenant_owner_only', true);
export const TenantAdminOnly = () => SetMetadata('tenant_admin_only', true);

export { RequirePermission, RequirePermissions } from '../../../common/decorators/permissions.decorator';
