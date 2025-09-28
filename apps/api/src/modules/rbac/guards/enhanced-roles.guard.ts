import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleService } from '../services/role-new.service';
import { ROLES_KEY, MIN_ROLE_LEVEL_KEY } from '../decorators/enhanced-roles.decorator';

@Injectable()
export class EnhancedRolesGuard implements CanActivate {
  private readonly logger = new Logger(EnhancedRolesGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly roleService: RoleService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check for required roles
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()]
    );

    // Check for minimum role level
    const minRoleLevel = this.reflector.getAllAndOverride<number>(
      MIN_ROLE_LEVEL_KEY,
      [context.getHandler(), context.getClass()]
    );

    // Check for special flags
    const requireMfa = this.reflector.getAllAndOverride<boolean>(
      'require_mfa',
      [context.getHandler(), context.getClass()]
    );

    const sensitiveOperation = this.reflector.getAllAndOverride<boolean>(
      'sensitive_operation',
      [context.getHandler(), context.getClass()]
    );

    const highPrivilegeOperation = this.reflector.getAllAndOverride<boolean>(
      'high_privilege_operation',
      [context.getHandler(), context.getClass()]
    );

    const systemOperation = this.reflector.getAllAndOverride<boolean>(
      'system_operation',
      [context.getHandler(), context.getClass()]
    );

    const tenantOwnerOnly = this.reflector.getAllAndOverride<boolean>(
      'tenant_owner_only',
      [context.getHandler(), context.getClass()]
    );

    const tenantAdminOnly = this.reflector.getAllAndOverride<boolean>(
      'tenant_admin_only',
      [context.getHandler(), context.getClass()]
    );

    // If no role requirements, allow access
    if (!requiredRoles && minRoleLevel === undefined && !systemOperation && !tenantOwnerOnly && !tenantAdminOnly) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Get user's roles and highest role
    const userRoleData = await this.roleService.getUserRoles(user.id);
    const userRoles = userRoleData.userRoles.map(ur => ur.roleName);
    const highestRole = await this.roleService.getUserHighestRole(user.id);

    // Attach role information to user object for parameter decorators
    user.roles = userRoleData.userRoles;
    user.highestRole = highestRole;
    user.permissions = await this.roleService.getUserPermissions(user.id);

    // Check system operation (Super Admin only)
    if (systemOperation && !userRoles.includes('Super Admin')) {
      this.logger.warn(
        `User ${user.id} (${user.email}) denied access to system operation. Requires Super Admin role.`
      );
      throw new ForbiddenException('This operation requires Super Admin privileges');
    }

    // Check tenant owner only
    if (tenantOwnerOnly && !userRoles.includes('Owner') && !userRoles.includes('Super Admin')) {
      this.logger.warn(
        `User ${user.id} (${user.email}) denied access to tenant owner operation.`
      );
      throw new ForbiddenException('This operation requires Tenant Owner privileges');
    }

    // Check tenant admin only
    if (tenantAdminOnly && 
        !userRoles.includes('Owner') && 
        !userRoles.includes('Admin') && 
        !userRoles.includes('Super Admin')) {
      this.logger.warn(
        `User ${user.id} (${user.email}) denied access to tenant admin operation.`
      );
      throw new ForbiddenException('This operation requires Tenant Admin privileges');
    }

    // Check MFA requirement
    if (requireMfa && !user.twoFactorEnabled) {
      this.logger.warn(
        `User ${user.id} (${user.email}) denied access - MFA required but not enabled.`
      );
      throw new ForbiddenException('This operation requires multi-factor authentication');
    }

    // Check sensitive operation (Admin level or above)
    if (sensitiveOperation && highestRole && highestRole.level > 2) {
      this.logger.warn(
        `User ${user.id} (${user.email}) denied access to sensitive operation. Requires Admin level or above.`
      );
      throw new ForbiddenException('This sensitive operation requires Admin-level privileges');
    }

    // Check high privilege operation (Owner level or above)
    if (highPrivilegeOperation && highestRole && highestRole.level > 1) {
      this.logger.warn(
        `User ${user.id} (${user.email}) denied access to high privilege operation. Requires Owner level or above.`
      );
      throw new ForbiddenException('This high privilege operation requires Owner-level access');
    }

    // Check specific roles
    if (requiredRoles && requiredRoles.length > 0) {
      const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));
      
      if (!hasRequiredRole) {
        this.logger.warn(
          `User ${user.id} (${user.email}) denied access. Required roles: ${requiredRoles.join(', ')}. User roles: ${userRoles.join(', ')}`
        );
        throw new ForbiddenException(
          `Insufficient role privileges. Required: ${requiredRoles.join(' OR ')}`
        );
      }
    }

    // Check minimum role level
    if (minRoleLevel !== undefined && highestRole && highestRole.level > minRoleLevel) {
      this.logger.warn(
        `User ${user.id} (${user.email}) denied access. Required minimum level: ${minRoleLevel}. User highest level: ${highestRole.level}`
      );
      throw new ForbiddenException(
        `Insufficient role level. Required level ${minRoleLevel} or higher`
      );
    }

    return true;
  }
}
