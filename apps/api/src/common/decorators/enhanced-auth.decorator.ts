import { applyDecorators, UseGuards } from '@nestjs/common';
import { EnhancedAuthGuard } from '../guards/enhanced-auth.guard';
import {
  RequirePermissions,
  RequirePermission,
  PermissionMetadata,
  RequireCreate,
  RequireRead,
  RequireUpdate,
  RequireDelete,
  RequireManage,
  RequireApprove,
  RequireReject,
  RequireExport,
  RequireImport,
  RequireAssign,
  RequireRevoke,
} from './permissions.decorator';
import {
  Roles,
  RequireTenant,
  RequireMfa,
} from './auth.decorator';
import {
  PermissionResource,
  PermissionAction,
  PermissionScope,
} from '../../modules/rbac/entities/permission.entity';
import { UserRole } from '@app/shared';

// Re-export for convenience
export {
  RequirePermissions,
  RequirePermission,
  RequireCreate,
  RequireRead,
  RequireUpdate,
  RequireDelete,
  RequireManage,
  RequireApprove,
  RequireReject,
  RequireExport,
  RequireImport,
  RequireAssign,
  RequireRevoke,
};

/**
 * Enhanced authentication decorator that combines all security checks
 */
export const EnhancedAuth = (options?: {
  roles?: UserRole[];
  permissions?: PermissionMetadata[];
  requireTenant?: boolean;
  requireMfa?: boolean;
}) => {
  const decorators = [UseGuards(EnhancedAuthGuard)];

  if (options?.roles) {
    decorators.push(Roles(...options.roles));
  }

  if (options?.permissions) {
    decorators.push(RequirePermissions(...options.permissions));
  }

  if (options?.requireTenant) {
    decorators.push(RequireTenant());
  }

  if (options?.requireMfa) {
    decorators.push(RequireMfa());
  }

  return applyDecorators(...decorators);
};

/**
 * Owner-only access decorator
 */
export const OwnerOnly = () =>
  EnhancedAuth({
    roles: [UserRole.OWNER],
    requireTenant: true,
  });

/**
 * Admin or higher access decorator
 */
export const AdminOnly = () =>
  EnhancedAuth({
    roles: [UserRole.OWNER, UserRole.ADMIN],
    requireTenant: true,
  });

/**
 * Manager or higher access decorator
 */
export const ManagerOnly = () =>
  EnhancedAuth({
    roles: [UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER],
    requireTenant: true,
  });

/**
 * Member or higher access decorator
 */
export const MemberOnly = () =>
  EnhancedAuth({
    roles: [UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.MEMBER],
    requireTenant: true,
  });

/**
 * Authenticated user (any role) decorator
 */
export const AuthenticatedUser = () =>
  EnhancedAuth({
    requireTenant: true,
  });

/**
 * Super Admin only decorator (platform-level access)
 */
export const SuperAdminOnly = () =>
  EnhancedAuth({
    roles: [UserRole.OWNER],
    requireTenant: false,
  });

/**
 * High privilege operation requiring MFA
 */
export const HighPrivilegeOperation = (permissions?: PermissionMetadata[]) =>
  EnhancedAuth({
    ...(permissions && { permissions }),
    requireMfa: true,
    requireTenant: true,
  });

/**
 * Sensitive operation requiring additional security checks
 */
export const SensitiveOperation = (
  roles: UserRole[],
  permissions: PermissionMetadata[]
) =>
  EnhancedAuth({
    roles,
    permissions,
    requireMfa: true,
    requireTenant: true,
  });

/**
 * User management operations
 */
export const UserManagement = (action: PermissionAction) =>
  EnhancedAuth({
    roles: [UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER],
    permissions: [{ resource: PermissionResource.USERS, action }],
    requireTenant: true,
  });

/**
 * Billing operations
 */
export const BillingOperation = (action: PermissionAction) =>
  EnhancedAuth({
    roles: [UserRole.OWNER, UserRole.ADMIN],
    permissions: [{ resource: PermissionResource.BILLING, action }],
    requireTenant: true,
  });

/**
 * System settings operations (Super Admin only)
 */
export const SystemSettings = (action: PermissionAction) =>
  EnhancedAuth({
    roles: [UserRole.OWNER],
    permissions: [{ resource: PermissionResource.SYSTEM_SETTINGS, action }],
    requireTenant: false,
  });

/**
 * File operations
 */
export const FileOperation = (action: PermissionAction) =>
  EnhancedAuth({
    permissions: [{ resource: PermissionResource.FILES, action }],
    requireTenant: true,
  });

/**
 * Tenant operations
 */
export const TenantOperation = (action: PermissionAction) =>
  EnhancedAuth({
    roles: [UserRole.OWNER, UserRole.ADMIN],
    permissions: [{ resource: PermissionResource.TENANTS, action }],
    requireTenant: true,
  });
