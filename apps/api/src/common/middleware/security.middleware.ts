import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { 
  getSecurityConfig,
  getDevelopmentSecurityOverrides,
  getProductionSecurityOverrides 
} from '../../config/security.config';

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SecurityMiddleware.name);
  private readonly helmetInstance: any;

  constructor() {
    const baseConfig = getSecurityConfig();
    const isDevelopment = process.env.NODE_ENV === 'development';
    const isProduction = process.env.NODE_ENV === 'production';

    // Apply environment-specific overrides
    let finalConfig = baseConfig;
    
    if (isDevelopment) {
      const devOverrides = getDevelopmentSecurityOverrides();
      finalConfig = this.mergeConfigs(baseConfig, devOverrides);
      this.logger.debug('Applied development security overrides');
    } else if (isProduction) {
      const prodOverrides = getProductionSecurityOverrides();
      finalConfig = this.mergeConfigs(baseConfig, prodOverrides);
      this.logger.debug('Applied production security overrides');
    }

    // Initialize helmet with basic configuration
    this.helmetInstance = helmet();

    this.logger.log('Security middleware initialized with Helmet configuration');
  }

  use(req: Request, res: Response, next: NextFunction): void {
    // Apply custom security headers before helmet
    this.applyCustomHeaders(req, res);

    // Apply helmet security headers
    this.helmetInstance(req, res, (err: any) => {
      if (err) {
        this.logger.error('Error applying security headers:', err);
      }
      
      // Continue to next middleware
      next(err);
    });
  }

  private applyCustomHeaders(req: Request, res: Response): void {
    // Request ID for tracing
    const requestId = req.headers['x-request-id'] || this.generateRequestId();
    res.setHeader('X-Request-ID', requestId);

    // API Version
    res.setHeader('X-API-Version', '1.0.0');

    // Response Time (will be calculated by another middleware)
    res.setHeader('X-Response-Time-Start', Date.now().toString());

    // Security Headers (additional to Helmet)
    
    // Permissions Policy (Feature Policy replacement)
    res.setHeader(
      'Permissions-Policy',
      [
        'camera=()',
        'microphone=()',
        'geolocation=()',
        'interest-cohort=()',
        'payment=()',
        'usb=()',
        'accelerometer=()',
        'gyroscope=()',
        'magnetometer=()',
      ].join(', ')
    );

    // Clear Site Data (for logout endpoints)
    if (req.url.includes('/logout') || req.url.includes('/auth/logout')) {
      res.setHeader('Clear-Site-Data', '"cache", "cookies", "storage", "executionContexts"');
      this.logger.debug('Applied Clear-Site-Data header for logout endpoint');
    }

    // Cross-Origin Headers for file uploads
    if (req.url.includes('/files') && req.method === 'POST') {
      res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    }

    // Cache Control for API responses
    if (req.url.startsWith('/api/')) {
      if (req.url.includes('/auth/') || req.url.includes('/user/')) {
        // No cache for sensitive endpoints
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else if (req.method === 'GET') {
        // Short cache for GET endpoints
        res.setHeader('Cache-Control', 'private, max-age=300'); // 5 minutes
      } else {
        // No cache for non-GET requests
        res.setHeader('Cache-Control', 'no-cache');
      }
    }

    // Server header removal/modification
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
    
    // Custom server identifier (optional)
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Server', 'SaaS-API/1.0');
    }

    // Rate Limit Headers (placeholder - will be set by rate limiting middleware)
    // These are set here as defaults and updated by the rate limiter
    res.setHeader('X-RateLimit-Limit', '100');
    res.setHeader('X-RateLimit-Remaining', '99');

    this.logger.debug(`Applied custom security headers for ${req.method} ${req.url}`);
  }

  private mergeConfigs(base: any, override: any): any {
    const merged = JSON.parse(JSON.stringify(base));
    
    if (override.helmet?.contentSecurityPolicy?.directives) {
      merged.helmet.contentSecurityPolicy.directives = {
        ...merged.helmet.contentSecurityPolicy.directives,
        ...override.helmet.contentSecurityPolicy.directives,
      };
    }

    if (override.helmet?.hsts) {
      merged.helmet.hsts = {
        ...merged.helmet.hsts,
        ...override.helmet.hsts,
      };
    }

    return merged;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Response time middleware to calculate and add response time header
 */
@Injectable()
export class ResponseTimeMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ResponseTimeMiddleware.name);

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();

    // Override res.end to calculate response time
    const originalEnd = res.end.bind(res);
    
    res.end = function(chunk?: any, encoding?: any, cb?: any) {
      const responseTime = Date.now() - start;
      res.setHeader('X-Response-Time', `${responseTime}ms`);
      
      // Call original end method
      return originalEnd(chunk, encoding, cb);
    };

    next();
  }
}