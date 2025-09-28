import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantContextService, TenantContext } from '../services/tenant-context.service';
import { RoleService } from '../../rbac/services/role-new.service';
import { v4 as uuidv4 } from 'uuid';

/**
 * Tenant Context Middleware
 * Sets up tenant context for each request based on authenticated user
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantContextMiddleware.name);

  constructor(
    private readonly tenantContextService: TenantContextService,
    private readonly roleService: RoleService
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const requestId = uuidv4();
    const startTime = Date.now();

    try {
      // Get user from request (should be set by auth middleware)
      const user = (req as any).user;

      if (user) {
        // Get user's roles
        const userRoles = await this.roleService.getUserRoles(user.id);
        const roleNames = userRoles.userRoles.map(ur => ur.roleName);

        // Create tenant context
        const tenantContext: TenantContext = {
          tenantId: user.tenantId,
          tenantName: user.tenantName || undefined,
          userId: user.id,
          userEmail: user.email,
          userRoles: roleNames,
          requestId,
        };

        // Set tenant context for this request
        this.tenantContextService.setTenantContext(tenantContext);

        this.logger.debug(
          `Tenant context set: ${user.tenantId} | User: ${user.email} | Roles: ${roleNames.join(', ')} | Request: ${requestId}`
        );

        // Add tenant info to request for easy access
        (req as any).tenantContext = tenantContext;
        (req as any).tenantId = user.tenantId;
      } else {
        // No user authentication - this might be a public endpoint
        this.logger.debug(`No user authentication for request ${requestId}`);
      }

      next();
    } catch (error) {
      this.logger.error(`Failed to set tenant context for request ${requestId}:`, error);
      
      // Continue with the request even if tenant context setup fails
      // This allows the request to proceed and potentially fail at the authorization level
      next();
    } finally {
      const duration = Date.now() - startTime;
      this.logger.debug(`Tenant context middleware completed in ${duration}ms for request ${requestId}`);
    }
  }
}

/**
 * Tenant Context Guard - alternative approach using a guard instead of middleware
 */
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class TenantContextGuard implements CanActivate {
  private readonly logger = new Logger(TenantContextGuard.name);

  constructor(
    private readonly tenantContextService: TenantContextService,
    private readonly roleService: RoleService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      // No user - let other guards handle authentication
      return true;
    }

    try {
      // Get user's roles
      const userRoles = await this.roleService.getUserRoles(user.id);
      const roleNames = userRoles.userRoles.map(ur => ur.roleName);

      // Create tenant context
      const tenantContext: TenantContext = {
        tenantId: user.tenantId,
        tenantName: user.tenantName,
        userId: user.id,
        userEmail: user.email,
        userRoles: roleNames,
        requestId: request.id || uuidv4(),
      };

      // Set tenant context
      this.tenantContextService.setTenantContext(tenantContext);

      // Add to request
      request.tenantContext = tenantContext;
      request.tenantId = user.tenantId;

      this.logger.debug(`Tenant context guard set context for user ${user.email} in tenant ${user.tenantId}`);
      
      return true;
    } catch (error) {
      this.logger.error('Failed to set tenant context in guard:', error);
      return true; // Allow the request to proceed
    }
  }
}
