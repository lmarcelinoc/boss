export { Permission } from '@prisma/client';

// Additional permission types for RBAC system
export enum PermissionAction {
  CREATE = 'create',
  READ = 'read', 
  UPDATE = 'update',
  DELETE = 'delete',
  MANAGE = 'manage',
  APPROVE = 'approve',
  REJECT = 'reject',
  EXPORT = 'export',
  IMPORT = 'import',
  ASSIGN = 'assign',
  REVOKE = 'revoke'
}

export enum PermissionResource {
  USERS = 'users',
  ROLES = 'roles',
  PERMISSIONS = 'permissions',
  TENANTS = 'tenants',
  TEAMS = 'teams',
  SESSIONS = 'sessions',
  BILLING = 'billing',
  SUBSCRIPTIONS = 'subscriptions',
  FILES = 'files',
  NOTIFICATIONS = 'notifications',
  REPORTS = 'reports',
  ANALYTICS = 'analytics',
  AUDIT = 'audit',
  SYSTEM_SETTINGS = 'system_settings'
}

export enum PermissionScope {
  TENANT = 'tenant',
  SYSTEM = 'system',
  TEAM = 'team',
  USER = 'user'
}
