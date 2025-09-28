import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PermissionCheckerService } from '../services/permission-checker.service';
import { RolesGuard } from './roles.guard';
import { PermissionsGuard } from './permissions.guard';
import { TenantGuard } from './tenant.guard';
import { MfaGuard } from './mfa.guard';

@Injectable()
export class EnhancedAuthGuard implements CanActivate {
  private readonly logger = new Logger(EnhancedAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly permissionChecker: PermissionCheckerService,
    private readonly rolesGuard: RolesGuard,
    private readonly permissionsGuard: PermissionsGuard,
    private readonly tenantGuard: TenantGuard,
    private readonly mfaGuard: MfaGuard
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    try {
      // 1. JWT Authentication
      await this.validateJwtToken(request);

      // 2. Tenant Context Validation
      const tenantRequired = await this.tenantGuard.canActivate(context);
      if (!tenantRequired) {
        return false;
      }

      // 3. MFA Validation (if required)
      const mfaPassed = await this.mfaGuard.canActivate(context);
      if (!mfaPassed) {
        return false;
      }

      // 4. Role-based Access Control
      const rolesPassed = await this.rolesGuard.canActivate(context);
      if (!rolesPassed) {
        return false;
      }

      // 5. Permission-based Access Control
      const permissionsPassed = await this.permissionsGuard.canActivate(context);
      if (!permissionsPassed) {
        return false;
      }

      this.logger.debug(
        `Enhanced auth passed for user ${request.user?.id} on ${request.method} ${request.url}`
      );

      return true;
    } catch (error) {
      this.logger.error(
        `Enhanced auth failed for ${request.method} ${request.url}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      throw error;
    }
  }

  private async validateJwtToken(request: any): Promise<void> {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'fallback-secret',
      });

      // Add user information to request
      request.user = {
        id: payload.sub || payload.userId,
        email: payload.email,
        tenantId: payload.tenantId,
        firstName: payload.firstName,
        lastName: payload.lastName,
        roles: payload.roles || [],
        permissions: payload.permissions || [],
      };

      this.logger.debug(`JWT validated for user ${request.user.id}`);
    } catch (error) {
      this.logger.warn(`JWT validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
