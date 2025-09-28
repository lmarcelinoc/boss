import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionCheckerService } from '../services/permission-checker.service';
import {
  PERMISSIONS_KEY,
  PermissionMetadata,
} from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly permissionChecker: PermissionCheckerService
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

    try {
      // Check if user has any of the required permissions
      await this.permissionChecker.assertAnyPermission(
        user.id,
        requiredPermissions.map(p => ({
          resource: p.resource,
          action: p.action,
          ...(p.scope && { scope: p.scope }),
        }))
      );

      this.logger.debug(
        `User ${user.id} granted access to ${request.method} ${request.url}`
      );

      return true;
    } catch (error) {
      this.logger.warn(
        `User ${user.id} denied access to ${request.method} ${request.url}. Required permissions: ${requiredPermissions
          .map(p => `${p.resource}:${p.action}`)
          .join(' OR ')}`
      );

      throw new ForbiddenException(
        `Insufficient permissions. Required: ${requiredPermissions
          .map(p => `${p.resource}:${p.action}`)
          .join(' OR ')}`
      );
    }
  }
}
