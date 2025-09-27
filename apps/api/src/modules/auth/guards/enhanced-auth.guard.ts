import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  IS_PUBLIC_KEY,
  SKIP_AUTH_KEY,
  ROLES_KEY,
  TENANT_REQUIRED_KEY,
  MFA_REQUIRED_KEY,
} from '../decorators/auth.decorator';
import { PERMISSIONS_KEY, PermissionMetadata } from '../../../common/decorators/permissions.decorator';
import { JwtService } from '../services/jwt.service';
import { UserRole } from '@app/shared';
import { PrismaService } from '../../../database/prisma.service';

/**
 * Enhanced authentication guard that combines:
 * - JWT token validation
 * - Role-based access control
 * - Permission-based access control  
 * - Multi-factor authentication checks
 * - Tenant isolation enforcement
 */
@Injectable()
export class EnhancedAuthGuard implements CanActivate {
  private readonly logger = new Logger(EnhancedAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Check if route is public or should skip auth
    if (this.isPublicRoute(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    
    // 2. Validate JWT token and extract user
    const user = await this.validateAndExtractUser(request);
    request.user = user;

    // 3. Load additional user data for permission checks
    const userWithPermissions = await this.loadUserPermissions(user);
    request.user = userWithPermissions;

    // 4. Check role requirements
    await this.validateRoles(context, userWithPermissions);

    // 5. Check permission requirements
    await this.validatePermissions(context, userWithPermissions);

    // 6. Check tenant requirements
    await this.validateTenant(context, userWithPermissions);

    // 7. Check MFA requirements
    await this.validateMfa(context, userWithPermissions);

    return true;
  }

  private isPublicRoute(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const skipAuth = this.reflector.getAllAndOverride<boolean>(SKIP_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return isPublic || skipAuth;
  }

  private async validateAndExtractUser(request: any): Promise<any> {
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Access token is required');
    }

    if (!this.jwtService.validateTokenFormat(token)) {
      throw new UnauthorizedException('Invalid token format');
    }

    const tokenType = this.jwtService.getTokenType(token);
    if (tokenType !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    if (this.jwtService.isTokenExpired(token)) {
      throw new UnauthorizedException('Token has expired');
    }

    try {
      const payload = this.jwtService.verifyAccessToken(token);
      return payload;
    } catch (error) {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  private async loadUserPermissions(user: any): Promise<any> {
    try {
      // Load user with roles and permissions from database
      const fullUser = await this.prisma.user.findUnique({
        where: { id: user.sub },
        include: {
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: {
                      permission: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!fullUser) {
        throw new UnauthorizedException('User not found');
      }

      // Extract permissions from roles
      const permissions: string[] = [];
      const roles: string[] = [];

      fullUser.userRoles.forEach(userRole => {
        roles.push(userRole.role.name);
        userRole.role.rolePermissions.forEach(rolePermission => {
          const permissionName = rolePermission.permission.name;
          if (!permissions.includes(permissionName)) {
            permissions.push(permissionName);
          }
        });
      });

      return {
        ...user,
        roles,
        permissions,
        twoFactorEnabled: fullUser.twoFactorEnabled,
        emailVerified: fullUser.emailVerified,
      };
    } catch (error) {
      this.logger.error(`Failed to load user permissions: ${error.message}`);
      throw new UnauthorizedException('Failed to load user data');
    }
  }

  private async validateRoles(context: ExecutionContext, user: any): Promise<void> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return; // No roles required
    }

    const hasRole = requiredRoles.some(role => user.roles?.includes(role));

    if (!hasRole) {
      const request = context.switchToHttp().getRequest();
      this.logger.warn(
        `User ${user.sub} denied access to ${request.method} ${request.url}. Required roles: ${requiredRoles.join(', ')}. User roles: ${user.roles?.join(', ')}`
      );

      throw new ForbiddenException(
        `Insufficient role. Required: ${requiredRoles.join(' OR ')}. Current: ${user.roles?.join(', ')}`
      );
    }
  }

  private async validatePermissions(context: ExecutionContext, user: any): Promise<void> {
    const requiredPermissions = this.reflector.getAllAndOverride<PermissionMetadata[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return; // No permissions required
    }

    for (const permission of requiredPermissions) {
      const permissionName = `${permission.resource}:${permission.action}`;
      
      if (user.permissions?.includes(permissionName)) {
        return; // User has the required permission
      }

      // Check for manage permission as fallback
      const managePermission = `${permission.resource}:manage`;
      if (user.permissions?.includes(managePermission)) {
        return; // User has manage permission for this resource
      }
    }

    const request = context.switchToHttp().getRequest();
    this.logger.warn(
      `User ${user.sub} denied access to ${request.method} ${request.url}. Required permissions: ${requiredPermissions.map(p => `${p.resource}:${p.action}`).join(', ')}`
    );

    throw new ForbiddenException(
      `Insufficient permissions. Required: ${requiredPermissions
        .map(p => `${p.resource}:${p.action}`)
        .join(' OR ')}`
    );
  }

  private async validateTenant(context: ExecutionContext, user: any): Promise<void> {
    const requireTenant = this.reflector.getAllAndOverride<boolean>(
      TENANT_REQUIRED_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requireTenant) {
      return; // No tenant requirement
    }

    if (!user.tenantId) {
      const request = context.switchToHttp().getRequest();
      this.logger.warn(
        `User ${user.sub} denied access to ${request.method} ${request.url}. No tenant context available.`
      );

      throw new ForbiddenException('Tenant context required');
    }
  }

  private async validateMfa(context: ExecutionContext, user: any): Promise<void> {
    const requireMfa = this.reflector.getAllAndOverride<boolean>(
      MFA_REQUIRED_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requireMfa) {
      return; // No MFA requirement
    }

    // If user has MFA enabled, they must complete verification
    if (user.twoFactorEnabled && !user.mfaVerified) {
      const request = context.switchToHttp().getRequest();
      this.logger.warn(
        `User ${user.sub} denied access to ${request.method} ${request.url}. MFA verification required.`
      );

      throw new ForbiddenException('MFA verification required');
    }
  }

  private extractTokenFromHeader(request: any): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }
}

