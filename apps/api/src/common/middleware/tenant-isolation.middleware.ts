import {
  Injectable,
  NestMiddleware,
  Logger,
  BadRequestException,
  UnauthorizedException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { TenantService } from '../../modules/tenants/services/tenant.service';
import { TenantSwitchingService } from '../../modules/tenants/services/tenant-switching.service';

export interface TenantRequest extends Request {
  tenantId?: string;
  tenant?: any;
  tenantContext?: {
    id: string;
    name: string;
    domain?: string;
    plan: string;
    features?: string[];
    settings?: Record<string, any>;
  };
  userMembership?: {
    id: string;
    role: string;
    status: string;
    permissions: string[];
    joinedAt: Date;
    lastAccessedAt?: Date;
  };
}

@Injectable()
export class TenantIsolationMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantIsolationMiddleware.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly tenantService: TenantService,
    @Inject(forwardRef(() => TenantSwitchingService))
    private readonly tenantSwitchingService: TenantSwitchingService
  ) {}

  async use(
    req: TenantRequest | any,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // Skip tenant isolation for authentication routes
      const authRoutes = [
        '/api/auth/login',
        '/api/auth/register', 
        '/api/auth/forgot-password',
        '/api/auth/reset-password',
        '/api/auth/verify-email',
        '/api/auth/refresh',
        '/health'
      ];
      
      if (authRoutes.some(route => req.url.includes(route.replace('/api', '')))) {
        this.logger.debug(`Skipping tenant isolation for auth route: ${req.url}`);
        return next();
      }

      // Extract tenant context from multiple sources
      const tenantId = await this.extractTenantContext(req);

      if (tenantId) {
        // Load tenant details and set in request
        const tenant = await this.tenantService.getTenantById(tenantId);

        if (!tenant) {
          throw new BadRequestException('Invalid tenant context');
        }

        if (!tenant.isActive) {
          throw new UnauthorizedException('Tenant is inactive');
        }

        // Set tenant context in request
        req.tenantId = tenant.id;
        req.tenant = tenant;
        req.tenantContext = {
          id: tenant.id,
          name: tenant.name,
          domain: tenant.domain,
          plan: 'free', // Default plan, can be extended later
          features: [], // Default empty features, can be extended later  
          settings: tenant.settings,
        };

        // If user is authenticated, get their membership information
        if ((req.user as any)?.id) {
          try {
            const userId = (req.user as any).id;
            const { membership } =
              await this.tenantSwitchingService.getCurrentTenantContext(userId);

            if (membership && membership.tenantId === tenantId) {
              req.userMembership = {
                id: membership.id,
                role: membership.role,
                status: membership.status,
                permissions:
                  membership.permissions?.map((p: any) => p.getFullName()) || [],
                joinedAt: membership.joinedAt,
                lastAccessedAt: membership.lastAccessedAt,
              };

              // Update last accessed time asynchronously
              membership.updateLastAccessed();
              // Note: We don't await this to avoid blocking the request
              this.tenantSwitchingService['membershipRepository']
                .save(membership)
                .catch(error => {
                  this.logger.warn(
                    `Failed to update last accessed time: ${error.message}`
                  );
                });
            }
          } catch (error) {
            // Don't block the request if membership lookup fails
            this.logger.debug(
              `Could not load user membership: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
        }

        this.logger.debug(
          `Tenant context set: ${tenant.name} (${tenant.id}) for ${req.method} ${req.url}`
        );
      }

      next();
    } catch (error) {
      this.logger.error(
        `Error in tenant isolation middleware: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined
      );
      next(error);
    }
  }

  private async extractTenantContext(
    req: TenantRequest
  ): Promise<string | null> {
    // Priority order for tenant extraction:
    // 1. X-Tenant-ID header (for API calls)
    // 2. Subdomain (for web access)
    // 3. JWT token tenant claim
    // 4. User's tenant from authentication

    this.logger.debug(`Extracting tenant context for ${req.method} ${req.url}`);

    // 1. Check X-Tenant-ID header
    const tenantHeader = req.headers['x-tenant-id'] as string;
    if (tenantHeader) {
      this.logger.debug(`Found tenant ID in header: ${tenantHeader}`);
      return tenantHeader;
    }

    // 2. Check subdomain
    const subdomain = this.extractSubdomain(req);
    if (subdomain) {
      this.logger.debug(`Found subdomain: ${subdomain}`);
      try {
        const tenant = await this.tenantService.getTenantByDomain(subdomain);
        if (tenant) {
          this.logger.debug(`Found tenant by domain: ${tenant.id}`);
          return tenant.id;
        }
      } catch (error) {
        // Domain not found, continue to next method
        this.logger.debug(
          `Domain ${subdomain} not found, continuing to next tenant extraction method`
        );
      }
    }

    // 3. Check JWT token for tenant claim
    this.logger.debug('Attempting to extract tenant from JWT token');
    const tokenTenantId = await this.extractTenantFromToken(req);
    if (tokenTenantId) {
      this.logger.debug(`Found tenant ID in JWT token: ${tokenTenantId}`);
      return tokenTenantId;
    }

    // 4. Check authenticated user's tenant
    if ((req.user as any)?.tenantId) {
      this.logger.debug(
        `Found tenant ID in user object: ${(req.user as any).tenantId}`
      );
      return (req.user as any).tenantId;
    }

    this.logger.debug('No tenant context found');
    return null;
  }

  private extractSubdomain(req: TenantRequest): string | null {
    const host = req.get('host');
    if (!host) return null;

    // Handle localhost development
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      const subdomain = req.get('x-forwarded-host') || req.get('x-subdomain');
      if (subdomain) {
        return subdomain.split('.')[0] || null;
      }
      return null;
    }

    // Extract subdomain from hostname
    const parts = host.split('.');
    if (parts.length >= 3) {
      return parts[0] || null;
    }

    return null;
  }

  private async extractTenantFromToken(
    req: TenantRequest
  ): Promise<string | null> {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
      }

      const token = authHeader.substring(7);
      const payload = this.jwtService.verify(token, {
        ignoreExpiration: false,
        issuer: 'saas-boilerplate',
        audience: 'saas-boilerplate-users',
      });

      return payload.tenantId || null;
    } catch (error) {
      // Token verification failed, ignore
      this.logger.debug(
        `Token verification failed in tenant extraction: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return null;
    }
  }
}
