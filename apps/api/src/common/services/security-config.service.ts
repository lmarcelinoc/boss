import { Injectable, Logger } from '@nestjs/common';
import { 
  getSecurityConfig,
  getDevelopmentSecurityOverrides,
  getProductionSecurityOverrides 
} from '../../config/security.config';

@Injectable()
export class SecurityConfigService {
  private readonly logger = new Logger(SecurityConfigService.name);
  private readonly config = this.buildConfig();

  private buildConfig() {
    const baseConfig = getSecurityConfig();
    const isDevelopment = process.env.NODE_ENV === 'development';
    const isProduction = process.env.NODE_ENV === 'production';

    let finalConfig = baseConfig;

    if (isDevelopment) {
      const devOverrides = getDevelopmentSecurityOverrides();
      finalConfig = this.mergeConfigs(baseConfig, devOverrides);
      this.logger.debug('Applied development security configuration');
    } else if (isProduction) {
      const prodOverrides = getProductionSecurityOverrides();
      finalConfig = this.mergeConfigs(baseConfig, prodOverrides);
      this.logger.debug('Applied production security configuration');
    }

    return finalConfig;
  }

  /**
   * Get Helmet configuration for security headers
   */
  getHelmetConfig() {
    return this.config.helmet;
  }

  /**
   * Get CORS configuration
   */
  getCorsConfig() {
    return this.config.cors;
  }

  /**
   * Get rate limiting configuration
   */
  getRateLimitConfig() {
    return {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: process.env.NODE_ENV === 'development' ? 1000 : 100, // requests per windowMs
      message: {
        error: 'Too many requests',
        message: 'Too many requests from this IP, please try again later.',
        statusCode: 429,
      },
      standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
      legacyHeaders: false, // Disable the `X-RateLimit-*` headers
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      keyGenerator: (req: any) => {
        // Use IP + User ID for authenticated requests for more precise limiting
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const userId = req.user?.id || 'anonymous';
        return `${ip}:${userId}`;
      },
      skip: (req: any) => {
        // Skip rate limiting for health checks and static assets
        return (
          req.url === '/health' ||
          req.url.startsWith('/favicon') ||
          req.url.startsWith('/robots.txt')
        );
      },
      handler: (req: any, res: any) => {
        this.logger.warn(
          `Rate limit exceeded for ${req.ip} on ${req.method} ${req.url}`
        );
        res.status(429).json({
          error: 'Too many requests',
          message: 'Rate limit exceeded. Please try again later.',
          statusCode: 429,
          timestamp: new Date().toISOString(),
          path: req.url,
        });
      },
    };
  }

  /**
   * Get speed limiting configuration for progressive slowdown
   */
  getSpeedLimitConfig() {
    return {
      windowMs: 15 * 60 * 1000, // 15 minutes
      delayAfter: 50, // Allow 50 requests per 15 minutes at full speed
      delayMs: (hits: number) => hits * 100, // Add 100ms delay for each request after delayAfter
      maxDelayMs: 5000, // Maximum delay of 5 seconds
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      keyGenerator: (req: any) => {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const userId = req.user?.id || 'anonymous';
        return `speed:${ip}:${userId}`;
      },
      skip: (req: any) => {
        return (
          req.url === '/health' ||
          req.url.startsWith('/favicon') ||
          req.url.startsWith('/robots.txt')
        );
      },
      onLimitReached: (req: any) => {
        this.logger.warn(
          `Speed limit reached for ${req.ip} on ${req.method} ${req.url}`
        );
      },
    };
  }

  /**
   * Get CSP (Content Security Policy) directives
   */
  getCSPDirectives() {
    return this.config.helmet.contentSecurityPolicy.directives;
  }

  /**
   * Check if origin is allowed for CORS
   */
  isOriginAllowed(origin: string): boolean {
    if (!origin) return true; // Same-origin requests

    // Development mode allows all origins
    if (process.env.NODE_ENV === 'development') {
      return true;
    }

    // Check against configured origins
    const corsConfig = this.config.cors;
    
    if (typeof corsConfig.origin === 'boolean') {
      return corsConfig.origin;
    }

    if (Array.isArray(corsConfig.origin)) {
      return corsConfig.origin.includes(origin);
    }

    if (typeof corsConfig.origin === 'string') {
      return corsConfig.origin === origin;
    }

    return false;
  }

  /**
   * Get security headers for manual application
   */
  getSecurityHeaders() {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Download-Options': 'noopen',
      'X-Permitted-Cross-Domain-Policies': 'none',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
    };
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

    if (override.cors) {
      merged.cors = {
        ...merged.cors,
        ...override.cors,
      };
    }

    return merged;
  }
}