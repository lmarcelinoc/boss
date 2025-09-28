import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSIONS_KEY,
  PermissionMetadata,
} from '../../../common/decorators/permissions.decorator';
import { RoleService } from '../services/role-new.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly roleService: RoleService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<
      PermissionMetadata[]
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true; // No permissions required
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Get user's permissions
    const userPermissions = await this.roleService.getUserPermissions(user.id);

    // Check if user has any of the required permissions
    for (const requiredPermission of requiredPermissions) {
      if (await this.hasPermission(userPermissions, requiredPermission, user)) {
        return true;
      }
    }

    this.logger.warn(
      `User ${user.id} (${user.email}) denied access to ${request.method} ${request.url}. Required permissions: ${JSON.stringify(requiredPermissions)}`
    );

    throw new ForbiddenException(
      `Insufficient permissions. Required: ${requiredPermissions
        .map(p => `${p.resource}:${p.action}`)
        .join(' OR ')}`
    );
  }

  private async hasPermission(
    userPermissions: string[],
    requiredPermission: PermissionMetadata,
    user: any
  ): Promise<boolean> {
    const permissionName = `${requiredPermission.resource}:${requiredPermission.action}`;

    // Check if user has the exact permission
    if (userPermissions.includes(permissionName)) {
      // Check conditions if specified
      if (requiredPermission.conditions) {
        return this.evaluateConditions(requiredPermission.conditions, user);
      }
      return true;
    }

    // Check if user has MANAGE permission for the resource
    const managePermissionName = `${requiredPermission.resource}:manage`;
    if (userPermissions.includes(managePermissionName)) {
      if (requiredPermission.conditions) {
        return this.evaluateConditions(requiredPermission.conditions, user);
      }
      return true;
    }

    // Check for hierarchical permissions
    // Super Admin and Owner have all permissions
    const highestRole = await this.roleService.getUserHighestRole(user.id);
    if (highestRole && (highestRole.name === 'Super Admin' || highestRole.name === 'Owner')) {
      if (requiredPermission.conditions) {
        return this.evaluateConditions(requiredPermission.conditions, user);
      }
      return true;
    }

    return false;
  }

  private evaluateConditions(
    conditions: Record<string, any>,
    user: any
  ): boolean {
    // Example condition evaluation
    // This can be extended to support more complex conditions
    for (const [key, value] of Object.entries(conditions)) {
      switch (key) {
        case 'ownerOnly':
          if (value === true && user.id !== user.ownerId) {
            return false;
          }
          break;
        case 'sameTenant':
          if (value === true && user.tenantId !== user.targetTenantId) {
            return false;
          }
          break;
        case 'roleRequired':
          if (!user.roles?.some((role: any) => role.name === value)) {
            return false;
          }
          break;
        case 'levelRequired':
          // Check if user has at least the required level (lower number = higher authority)
          if (user.roles?.every((role: any) => role.level > value)) {
            return false;
          }
          break;
        // Add more condition types as needed
      }
    }
    return true;
  }
}
