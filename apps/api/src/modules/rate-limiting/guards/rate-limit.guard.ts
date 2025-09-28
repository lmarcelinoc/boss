import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { RateLimitingService, RateLimitConfig } from '../services/rate-limiting.service';
import { TenantContextService } from '../../tenants/services/tenant-context.service';
import { RATE_LIMIT_KEY, SKIP_RATE_LIMIT_KEY } from '../decorators/rate-limit.decorator';

/**
 * Rate Limiting Guard
 * Enforces rate limiting rules based on Redis-backed distributed rate limiting
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitingService: RateLimitingService,
    private readonly tenantContextService: TenantContextService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if rate limiting should be skipped
    const skipRateLimit = this.reflector.getAllAndOverride<boolean>(
      SKIP_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (skipRateLimit) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    try {
      // Get custom rate limit configuration from decorator
      const customRateLimit = this.reflector.getAllAndOverride<RateLimitConfig>(
        RATE_LIMIT_KEY,
        [context.getHandler(), context.getClass()]
      );

      // Extract request information
      const requestContext = this.extractRequestContext(request);

      // Get applicable rate limiting rules
      const applicableRules = customRateLimit
        ? [{ name: 'custom', config: customRateLimit }]
        : this.rateLimitingService.getApplicableRules({
            path: requestContext.path,
            method: requestContext.method,
            userType: requestContext.userType,
            tenantType: requestContext.tenantType,
          });

      if (applicableRules.length === 0) {
        // No rate limiting rules apply
        return true;
      }

      // Check each applicable rule
      const rateLimitChecks = applicableRules.map(rule => {
        const key = this.rateLimitingService.buildRateLimitKey(rule, {
          ip: requestContext.ip,
          userId: requestContext.userId,
          tenantId: requestContext.tenantId,
          userAgent: requestContext.userAgent,
        });

        return {
          rule,
          key,
          config: rule.config,
        };
      });

      // Perform rate limit checks
      const results = await Promise.all(
        rateLimitChecks.map(check =>
          this.rateLimitingService.checkRateLimit(check.key, check.config)
        )
      );

      // Find the most restrictive result (first one that's not allowed)
      let mostRestrictive = results[0];
      let restrictiveRule = rateLimitChecks[0];

      for (let i = 0; i < results.length; i++) {
        if (!results[i].allowed) {
          mostRestrictive = results[i];
          restrictiveRule = rateLimitChecks[i];
          break;
        }
      }

      // Set rate limiting headers
      this.setRateLimitHeaders(response, mostRestrictive, restrictiveRule.rule.name);

      // Check if request is allowed
      if (!mostRestrictive.allowed) {
        const errorMessage = `Rate limit exceeded for ${restrictiveRule.rule.name}`;
        
        this.logger.warn(
          `Rate limit exceeded: ${requestContext.identifier} - Rule: ${restrictiveRule.rule.name} - Key: ${restrictiveRule.key}`
        );

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: errorMessage,
            error: 'Too Many Requests',
            retryAfter: mostRestrictive.retryAfter,
            limit: restrictiveRule.config.maxRequests,
            remaining: mostRestrictive.remaining,
            resetTime: mostRestrictive.resetTime,
          },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }

      this.logger.debug(
        `Rate limit check passed: ${requestContext.identifier} - Rules checked: ${applicableRules.length}`
      );

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('Rate limiting error:', error);
      
      // Fail open - allow the request if there's an error
      return true;
    }
  }

  /**
   * Extract request context information
   */
  private extractRequestContext(request: Request) {
    const user = (request as any).user;
    const tenantContext = this.tenantContextService.getTenantContext();
    
    // Get client IP
    const ip = this.getClientIp(request);
    
    // Determine user type
    const userType = user ? 'authenticated' : 'anonymous';
    
    // Determine tenant type (would need to be extended based on subscription info)
    let tenantType: 'free' | 'paid' | 'enterprise' = 'free';
    
    // In a real implementation, this would check the tenant's subscription
    // For now, we'll use a simple heuristic
    if (tenantContext?.userRoles?.includes('Super Admin')) {
      tenantType = 'enterprise';
    } else if (tenantContext?.tenantId) {
      tenantType = 'paid'; // Assume paid if they have a tenant
    }

    return {
      ip,
      path: request.path,
      method: request.method,
      userType,
      tenantType,
      userId: user?.id,
      tenantId: tenantContext?.tenantId,
      userAgent: request.headers['user-agent'],
      identifier: user ? `User:${user.email}` : `IP:${ip}`,
    };
  }

  /**
   * Get the real client IP address
   */
  private getClientIp(request: Request): string {
    // Check various headers for the real IP
    const forwarded = request.headers['x-forwarded-for'];
    const realIp = request.headers['x-real-ip'];
    const cfConnectingIp = request.headers['cf-connecting-ip'];
    
    if (forwarded) {
      // X-Forwarded-For can contain multiple IPs, take the first one
      return (forwarded as string).split(',')[0].trim();
    }
    
    if (realIp) {
      return realIp as string;
    }
    
    if (cfConnectingIp) {
      return cfConnectingIp as string;
    }
    
    return request.ip || request.connection.remoteAddress || '0.0.0.0';
  }

  /**
   * Set rate limiting headers on the response
   */
  private setRateLimitHeaders(
    response: Response,
    result: any,
    ruleName: string
  ): void {
    response.setHeader('X-RateLimit-Rule', ruleName);
    response.setHeader('X-RateLimit-Limit', result.count + result.remaining);
    response.setHeader('X-RateLimit-Remaining', result.remaining);
    response.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString());
    
    if (result.retryAfter) {
      response.setHeader('Retry-After', result.retryAfter);
    }
  }
}
