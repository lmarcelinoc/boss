import {
  Controller,
  Get,
  Post,
  Delete,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RbacSeederService } from '../services/rbac-seeder.service';
import { RoleService } from '../services/role-new.service';
import { PermissionService } from '../services/permission-new.service';
import { EnhancedRolesGuard } from '../guards/enhanced-roles.guard';
import { PermissionsGuard } from '../guards/permissions-new.guard';
import { SuperAdminOnly, CurrentUser, UserId, UserRoles } from '../decorators/enhanced-roles.decorator';
import { RequirePermission } from '../../../common/decorators/permissions.decorator';
import { PermissionResource, PermissionAction } from '../entities/permission.entity';

@ApiTags('RBAC Administration')
@Controller('admin/rbac')
@UseGuards(EnhancedRolesGuard, PermissionsGuard)
export class RbacAdminController {
  private readonly logger = new Logger(RbacAdminController.name);

  constructor(
    private readonly rbacSeederService: RbacSeederService,
    private readonly roleService: RoleService,
    private readonly permissionService: PermissionService
  ) {}

  @Post('seed')
  @HttpCode(HttpStatus.OK)
  @SuperAdminOnly()
  @ApiOperation({ 
    summary: 'Seed RBAC system', 
    description: 'Initialize the complete RBAC system with roles, permissions, and Super Admin user' 
  })
  @ApiResponse({ 
    status: 200, 
    description: 'RBAC system seeded successfully' 
  })
  async seedRbacSystem(@CurrentUser() user: any) {
    this.logger.log(`Super Admin ${user.email} is seeding RBAC system`);
    
    await this.rbacSeederService.seedRbacSystem();
    
    return {
      success: true,
      message: 'RBAC system seeded successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('validate')
  @SuperAdminOnly()
  @ApiOperation({ 
    summary: 'Validate RBAC system', 
    description: 'Check if the RBAC system is properly configured' 
  })
  async validateRbacSystem() {
    const validation = await this.rbacSeederService.validateRbacSystem();
    
    return {
      success: validation.isValid,
      validation,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('reset')
  @HttpCode(HttpStatus.OK)
  @SuperAdminOnly()
  @ApiOperation({ 
    summary: 'Reset RBAC system', 
    description: 'WARNING: This will delete all roles, permissions, and role assignments' 
  })
  async resetRbacSystem(@CurrentUser() user: any) {
    this.logger.warn(`Super Admin ${user.email} is resetting RBAC system`);
    
    await this.rbacSeederService.resetRbacSystem();
    
    return {
      success: true,
      message: 'RBAC system reset successfully',
      warning: 'All roles, permissions, and assignments have been deleted',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('roles/hierarchy')
  @SuperAdminOnly()
  @ApiOperation({ 
    summary: 'Get role hierarchy', 
    description: 'Display the complete role hierarchy with permission counts' 
  })
  async getRoleHierarchy() {
    const roles = await this.roleService.getAllRoles(1, 100);
    
    return {
      success: true,
      roleHierarchy: roles.roles.map(role => ({
        id: role.id,
        name: role.name,
        description: role.description,
        level: role.level,
        permissionCount: role.totalPermissions,
        isSystem: role.isSystem,
        type: role.type,
      })),
      summary: {
        totalRoles: roles.total,
        systemRoles: roles.roles.filter(r => r.isSystem).length,
        customRoles: roles.roles.filter(r => !r.isSystem).length,
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('permissions/summary')
  @SuperAdminOnly()
  @ApiOperation({ 
    summary: 'Get permissions summary', 
    description: 'Display summary of all permissions by resource' 
  })
  async getPermissionsSummary() {
    const permissions = await this.permissionService.getAllPermissions(1, 1000);
    
    // Group by resource
    const byResource = permissions.permissions.reduce((acc, perm) => {
      if (!acc[perm.resource]) {
        acc[perm.resource] = [];
      }
      acc[perm.resource].push(perm);
      return acc;
    }, {} as Record<string, any[]>);

    return {
      success: true,
      permissionsSummary: {
        total: permissions.total,
        byResource: Object.entries(byResource).map(([resource, perms]) => ({
          resource,
          count: perms.length,
          actions: perms.map(p => p.action),
        })),
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('users/:userId/permissions/debug')
  @RequirePermission(PermissionResource.USERS, PermissionAction.READ)
  @ApiOperation({ 
    summary: 'Debug user permissions', 
    description: 'Get detailed permission information for a specific user' 
  })
  async debugUserPermissions(
    @UserId() currentUserId: string,
    @UserRoles() currentUserRoles: any[],
    @CurrentUser() currentUser: any
  ) {
    const userPermissions = await this.roleService.getUserPermissions(currentUserId);
    const userRoles = await this.roleService.getUserRoles(currentUserId);
    const highestRole = await this.roleService.getUserHighestRole(currentUserId);

    return {
      success: true,
      debug: {
        userId: currentUserId,
        email: currentUser.email,
        tenantId: currentUser.tenantId,
        roles: userRoles.userRoles,
        highestRole: highestRole ? {
          name: highestRole.name,
          level: highestRole.level,
          description: highestRole.description,
        } : null,
        permissions: userPermissions,
        permissionCount: userPermissions.length,
        authenticationInfo: {
          isAuthenticated: !!currentUser,
          sessionInfo: {
            lastLoginAt: currentUser.lastLoginAt,
            lastLoginIp: currentUser.lastLoginIp,
          },
        },
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  @ApiOperation({ 
    summary: 'RBAC system health check', 
    description: 'Quick health check for the RBAC system' 
  })
  async healthCheck() {
    try {
      const validation = await this.rbacSeederService.validateRbacSystem();
      
      return {
        success: true,
        health: validation.isValid ? 'healthy' : 'issues_detected',
        summary: validation.summary,
        issues: validation.issues,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        health: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
