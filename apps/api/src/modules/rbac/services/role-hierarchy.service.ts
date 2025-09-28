import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Role, RoleType } from '@prisma/client';

@Injectable()
export class RoleHierarchyService {
  private readonly logger = new Logger(RoleHierarchyService.name);

  constructor(
    private readonly prisma: PrismaService
  ) {}

  async createDefaultRoles(): Promise<void> {
    const defaultRoles = this.generateDefaultRoleHierarchy();

    for (const roleData of defaultRoles) {
      const existingRole = await this.prisma.role.findUnique({
        where: { name: roleData.name },
      });

      if (!existingRole) {
        const role = await this.prisma.role.create({
          data: roleData,
        });
        
        await this.assignDefaultPermissionsToRole(role);
        this.logger.log(`Created default role: ${role.name} (Level ${role.level})`);
      } else {
        this.logger.log(`Default role already exists: ${existingRole.name}`);
      }
    }
  }

  private async assignDefaultPermissionsToRole(role: Role): Promise<void> {
    const permissionNames = this.getDefaultPermissionsForRole(role.name);
    
    if (permissionNames.length === 0) {
      this.logger.warn(`No default permissions defined for role: ${role.name}`);
      return;
    }

    // Find permissions by name
    const permissions = await this.prisma.permission.findMany({
      where: { name: { in: permissionNames } },
    });

    if (permissions.length > 0) {
      // Create role-permission associations
      await this.prisma.rolePermission.createMany({
        data: permissions.map(permission => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });

      this.logger.log(
        `Assigned ${permissions.length} permissions to ${role.name} role`
      );
    } else {
      this.logger.warn(
        `No permissions found for role ${role.name} with names: ${permissionNames.join(', ')}`
      );
    }
  }

  /**
   * Generate the hierarchical role system as defined in the PRD/Architecture
   */
  private generateDefaultRoleHierarchy(): Array<{
    name: string;
    description: string;
    level: number;
    type: RoleType;
    isSystem: boolean;
  }> {
    return [
      {
        name: 'Super Admin',
        description: '🔐 Ultimate system administrator with ALL permissions across all tenants',
        level: 1,
        type: RoleType.SYSTEM,
        isSystem: true,
      },
      {
        name: 'Owner',
        description: '👑 Tenant owner with full access to all tenant resources',
        level: 1,
        type: RoleType.SYSTEM,
        isSystem: true,
      },
      {
        name: 'Admin',
        description: '⚙️ Administrator with management permissions (no system settings)',
        level: 2,
        type: RoleType.SYSTEM,
        isSystem: true,
      },
      {
        name: 'Manager',
        description: '👥 Team manager with user and team management permissions',
        level: 3,
        type: RoleType.SYSTEM,
        isSystem: true,
      },
      {
        name: 'Member',
        description: '📝 Regular member with basic operational permissions',
        level: 4,
        type: RoleType.SYSTEM,
        isSystem: true,
      },
      {
        name: 'Viewer',
        description: '👁️ Read-only access to assigned resources',
        level: 5,
        type: RoleType.SYSTEM,
        isSystem: true,
      },
    ];
  }

  /**
   * Get default permissions for each role based on the architecture document
   */
  private getDefaultPermissionsForRole(roleName: string): string[] {
    const permissionMap: Record<string, string[]> = {
      'Super Admin': [
        // ALL PERMISSIONS (132 total as per architecture doc)
        // User Management - All actions
        'users:create', 'users:read', 'users:update', 'users:delete', 'users:manage',
        'users:approve', 'users:reject', 'users:export', 'users:import', 'users:assign', 'users:revoke',
        
        // Role Management - All actions
        'roles:create', 'roles:read', 'roles:update', 'roles:delete', 'roles:manage',
        'roles:approve', 'roles:reject', 'roles:export', 'roles:import', 'roles:assign', 'roles:revoke',
        
        // Permission Management - All actions
        'permissions:create', 'permissions:read', 'permissions:update', 'permissions:delete', 'permissions:manage',
        'permissions:approve', 'permissions:reject', 'permissions:export', 'permissions:import', 'permissions:assign', 'permissions:revoke',
        
        // Tenant Management - All actions (Global scope)
        'tenants:create', 'tenants:read', 'tenants:update', 'tenants:delete', 'tenants:manage',
        'tenants:approve', 'tenants:reject', 'tenants:export', 'tenants:import', 'tenants:assign', 'tenants:revoke',
        
        // Team Management - All actions
        'teams:create', 'teams:read', 'teams:update', 'teams:delete', 'teams:manage',
        'teams:approve', 'teams:reject', 'teams:export', 'teams:import', 'teams:assign', 'teams:revoke',
        
        // Session Management - All actions
        'sessions:create', 'sessions:read', 'sessions:update', 'sessions:delete', 'sessions:manage',
        'sessions:approve', 'sessions:reject', 'sessions:export', 'sessions:import', 'sessions:assign', 'sessions:revoke',
        
        // Billing Management - All actions
        'billing:create', 'billing:read', 'billing:update', 'billing:delete', 'billing:manage',
        'billing:approve', 'billing:reject', 'billing:export', 'billing:import', 'billing:assign', 'billing:revoke',
        
        // Subscription Management - All actions
        'subscriptions:create', 'subscriptions:read', 'subscriptions:update', 'subscriptions:delete', 'subscriptions:manage',
        'subscriptions:approve', 'subscriptions:reject', 'subscriptions:export', 'subscriptions:import', 'subscriptions:assign', 'subscriptions:revoke',
        
        // File Management - All actions
        'files:create', 'files:read', 'files:update', 'files:delete', 'files:manage',
        'files:approve', 'files:reject', 'files:export', 'files:import', 'files:assign', 'files:revoke',
        
        // Notification Management - All actions
        'notifications:create', 'notifications:read', 'notifications:update', 'notifications:delete', 'notifications:manage',
        'notifications:approve', 'notifications:reject', 'notifications:export', 'notifications:import', 'notifications:assign', 'notifications:revoke',
        
        // Reports and Analytics - All actions
        'reports:create', 'reports:read', 'reports:update', 'reports:delete', 'reports:manage',
        'reports:approve', 'reports:reject', 'reports:export', 'reports:import', 'reports:assign', 'reports:revoke',
        
        // System Settings - All actions (Global scope)
        'system_settings:create', 'system_settings:read', 'system_settings:update', 'system_settings:delete', 'system_settings:manage',
        'system_settings:approve', 'system_settings:reject', 'system_settings:export', 'system_settings:import', 'system_settings:assign', 'system_settings:revoke',
      ],
      
      'Owner': [
        // ALL PERMISSIONS except system settings (132 total as per architecture doc)
        // User Management - All actions
        'users:create', 'users:read', 'users:update', 'users:delete', 'users:manage',
        'users:approve', 'users:reject', 'users:export', 'users:import', 'users:assign', 'users:revoke',
        
        // Role Management - All actions
        'roles:create', 'roles:read', 'roles:update', 'roles:delete', 'roles:manage',
        'roles:approve', 'roles:reject', 'roles:export', 'roles:import', 'roles:assign', 'roles:revoke',
        
        // Permission Management - All actions
        'permissions:create', 'permissions:read', 'permissions:update', 'permissions:delete', 'permissions:manage',
        'permissions:approve', 'permissions:reject', 'permissions:export', 'permissions:import', 'permissions:assign', 'permissions:revoke',
        
        // Tenant Management - All actions (tenant-specific)
        'tenants:read', 'tenants:update', 'tenants:manage', 'tenants:export', 'tenants:import',
        
        // Team Management - All actions
        'teams:create', 'teams:read', 'teams:update', 'teams:delete', 'teams:manage',
        'teams:approve', 'teams:reject', 'teams:export', 'teams:import', 'teams:assign', 'teams:revoke',
        
        // Session Management - All actions
        'sessions:create', 'sessions:read', 'sessions:update', 'sessions:delete', 'sessions:manage',
        'sessions:approve', 'sessions:reject', 'sessions:export', 'sessions:import', 'sessions:assign', 'sessions:revoke',
        
        // Billing Management - All actions
        'billing:create', 'billing:read', 'billing:update', 'billing:delete', 'billing:manage',
        'billing:approve', 'billing:reject', 'billing:export', 'billing:import', 'billing:assign', 'billing:revoke',
        
        // Subscription Management - All actions
        'subscriptions:create', 'subscriptions:read', 'subscriptions:update', 'subscriptions:delete', 'subscriptions:manage',
        'subscriptions:approve', 'subscriptions:reject', 'subscriptions:export', 'subscriptions:import', 'subscriptions:assign', 'subscriptions:revoke',
        
        // File Management - All actions
        'files:create', 'files:read', 'files:update', 'files:delete', 'files:manage',
        'files:approve', 'files:reject', 'files:export', 'files:import', 'files:assign', 'files:revoke',
        
        // Notification Management - All actions
        'notifications:create', 'notifications:read', 'notifications:update', 'notifications:delete', 'notifications:manage',
        'notifications:approve', 'notifications:reject', 'notifications:export', 'notifications:import', 'notifications:assign', 'notifications:revoke',
        
        // Reports and Analytics - All actions
        'reports:create', 'reports:read', 'reports:update', 'reports:delete', 'reports:manage',
        'reports:approve', 'reports:reject', 'reports:export', 'reports:import', 'reports:assign', 'reports:revoke',
      ],
      
      'Admin': [
        // Management permissions (121 total as per architecture doc)
        // Users - All except system settings
        'users:create', 'users:read', 'users:update', 'users:delete', 'users:manage',
        'users:approve', 'users:reject', 'users:export', 'users:import', 'users:assign', 'users:revoke',
        
        // Roles - All actions
        'roles:create', 'roles:read', 'roles:update', 'roles:delete', 'roles:manage',
        'roles:approve', 'roles:reject', 'roles:export', 'roles:import', 'roles:assign', 'roles:revoke',
        
        // Permissions - All actions
        'permissions:create', 'permissions:read', 'permissions:update', 'permissions:delete', 'permissions:manage',
        'permissions:approve', 'permissions:reject', 'permissions:export', 'permissions:import', 'permissions:assign', 'permissions:revoke',
        
        // Tenants - All actions
        'tenants:create', 'tenants:read', 'tenants:update', 'tenants:delete', 'tenants:manage',
        'tenants:approve', 'tenants:reject', 'tenants:export', 'tenants:import', 'tenants:assign', 'tenants:revoke',
        
        // Teams - All actions
        'teams:create', 'teams:read', 'teams:update', 'teams:delete', 'teams:manage',
        'teams:approve', 'teams:reject', 'teams:export', 'teams:import', 'teams:assign', 'teams:revoke',
        
        // Sessions - All actions
        'sessions:create', 'sessions:read', 'sessions:update', 'sessions:delete', 'sessions:manage',
        'sessions:approve', 'sessions:reject', 'sessions:export', 'sessions:import', 'sessions:assign', 'sessions:revoke',
        
        // Billing - All actions
        'billing:create', 'billing:read', 'billing:update', 'billing:delete', 'billing:manage',
        'billing:approve', 'billing:reject', 'billing:export', 'billing:import', 'billing:assign', 'billing:revoke',
        
        // Subscriptions - All actions
        'subscriptions:create', 'subscriptions:read', 'subscriptions:update', 'subscriptions:delete', 'subscriptions:manage',
        'subscriptions:approve', 'subscriptions:reject', 'subscriptions:export', 'subscriptions:import', 'subscriptions:assign', 'subscriptions:revoke',
        
        // Files - All actions
        'files:create', 'files:read', 'files:update', 'files:delete', 'files:manage',
        'files:approve', 'files:reject', 'files:export', 'files:import', 'files:assign', 'files:revoke',
        
        // Notifications - All actions
        'notifications:create', 'notifications:read', 'notifications:update', 'notifications:delete', 'notifications:manage',
        'notifications:approve', 'notifications:reject', 'notifications:export', 'notifications:import', 'notifications:assign', 'notifications:revoke',
        
        // Reports - All actions
        'reports:create', 'reports:read', 'reports:update', 'reports:delete', 'reports:manage',
        'reports:approve', 'reports:reject', 'reports:export', 'reports:import', 'reports:assign', 'reports:revoke',
      ],
      
      'Manager': [
        // Team and user management (55 total as per architecture doc)
        // Users - All actions
        'users:create', 'users:read', 'users:update', 'users:delete', 'users:manage',
        'users:approve', 'users:reject', 'users:export', 'users:import', 'users:assign', 'users:revoke',
        
        // Teams - All actions
        'teams:create', 'teams:read', 'teams:update', 'teams:delete', 'teams:manage',
        'teams:approve', 'teams:reject', 'teams:export', 'teams:import', 'teams:assign', 'teams:revoke',
        
        // Files - All actions
        'files:create', 'files:read', 'files:update', 'files:delete', 'files:manage',
        'files:approve', 'files:reject', 'files:export', 'files:import', 'files:assign', 'files:revoke',
        
        // Notifications - All actions
        'notifications:create', 'notifications:read', 'notifications:update', 'notifications:delete', 'notifications:manage',
        'notifications:approve', 'notifications:reject', 'notifications:export', 'notifications:import', 'notifications:assign', 'notifications:revoke',
        
        // Reports - All actions
        'reports:create', 'reports:read', 'reports:update', 'reports:delete', 'reports:manage',
        'reports:approve', 'reports:reject', 'reports:export', 'reports:import', 'reports:assign', 'reports:revoke',
      ],
      
      'Member': [
        // Basic operations (16 total as per architecture doc)
        // Files - CRUD + export
        'files:create', 'files:read', 'files:update', 'files:export',
        
        // Notifications - CRUD + export
        'notifications:create', 'notifications:read', 'notifications:update', 'notifications:export',
        
        // Reports - CRUD + export
        'reports:create', 'reports:read', 'reports:update', 'reports:export',
        
        // Sessions - CRUD + export
        'sessions:create', 'sessions:read', 'sessions:update', 'sessions:export',
      ],
      
      'Viewer': [
        // Read-only access (24 total as per architecture doc)
        // All resources - read and export only
        'users:read', 'users:export',
        'roles:read', 'roles:export',
        'permissions:read', 'permissions:export',
        'tenants:read', 'tenants:export',
        'teams:read', 'teams:export',
        'sessions:read', 'sessions:export',
        'billing:read', 'billing:export',
        'subscriptions:read', 'subscriptions:export',
        'files:read', 'files:export',
        'notifications:read', 'notifications:export',
        'reports:read', 'reports:export',
        'system_settings:read', 'system_settings:export',
      ],
    };

    return permissionMap[roleName] || [];
  }
}
