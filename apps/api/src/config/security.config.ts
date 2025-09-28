import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export interface SecurityConfig {
  cors: CorsOptions;
  helmet: {
    contentSecurityPolicy: {
      directives: Record<string, string[]>;
    };
    crossOriginEmbedderPolicy: boolean;
    crossOriginOpenerPolicy: { policy: string };
    crossOriginResourcePolicy: { policy: string };
    dnsPrefetchControl: { allow: boolean };
    frameguard: { action: string };
    hidePoweredBy: boolean;
    hsts: {
      maxAge: number;
      includeSubDomains: boolean;
      preload: boolean;
    };
    ieNoOpen: boolean;
    noSniff: boolean;
    originAgentCluster: boolean;
    permittedCrossDomainPolicies: boolean;
    referrerPolicy: { policy: string[] };
    xssFilter: boolean;
  };
}

export const getSecurityConfig = (): SecurityConfig => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';

  // Allowed origins for CORS
  const allowedOrigins = [
    'http://localhost:3000', // Next.js development
    'http://localhost:3001', // API development
    'http://localhost:19006', // Expo development
    ...(process.env.ALLOWED_ORIGINS?.split(',') || []),
  ];

  return {
    cors: {
      origin: isDevelopment
        ? true // Allow all origins in development
        : (origin, callback) => {
            // In production, check against allowed origins
            if (!origin || allowedOrigins.includes(origin)) {
              callback(null, true);
            } else {
              callback(new Error('Not allowed by CORS policy'));
            }
          },
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Accept',
        'Accept-Version',
        'Authorization',
        'Cache-Control',
        'Content-Length',
        'Content-MD5',
        'Content-Type',
        'Date',
        'X-Api-Version',
        'X-Tenant-ID',
        'X-Request-ID',
        'X-CSRF-Token',
        'x-forwarded-for',
        'x-forwarded-proto',
        'x-forwarded-host',
      ],
      exposedHeaders: [
        'X-Request-ID',
        'X-Response-Time',
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
      ],
      credentials: true,
      maxAge: 86400, // 24 hours
      optionsSuccessStatus: 200,
    },

    helmet: {
      // Content Security Policy
      contentSecurityPolicy: {
        directives: {
          'default-src': ["'self'"],
          'base-uri': ["'self'"],
          'block-all-mixed-content': [],
          'font-src': ["'self'", 'https:', 'data:'],
          'frame-ancestors': ["'self'"],
          'img-src': ["'self'", 'data:', 'https:'],
          'object-src': ["'none'"],
          'script-src': isDevelopment
            ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
            : ["'self'"],
          'script-src-attr': ["'none'"],
          'style-src': ["'self'", 'https:', "'unsafe-inline'"],
          'connect-src': [
            "'self'",
            'https:',
            ...(isDevelopment ? ['ws:', 'wss:', 'http:'] : []),
          ],
          'upgrade-insecure-requests': [],
        },
      },

      // Cross-Origin Embedder Policy
      crossOriginEmbedderPolicy: false, // Disable if needed for third-party embeds

      // Cross-Origin Opener Policy
      crossOriginOpenerPolicy: { 
        policy: 'same-origin-allow-popups' as const
      },

      // Cross-Origin Resource Policy
      crossOriginResourcePolicy: { 
        policy: 'cross-origin' 
      },

      // DNS Prefetch Control
      dnsPrefetchControl: { 
        allow: false 
      },

      // X-Frame-Options
      frameguard: { 
        action: 'sameorigin' 
      },

      // Hide X-Powered-By header
      hidePoweredBy: true,

      // HTTP Strict Transport Security (HSTS)
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },

      // X-Download-Options for IE8+
      ieNoOpen: true,

      // X-Content-Type-Options
      noSniff: true,

      // Origin-Agent-Cluster header
      originAgentCluster: true,

      // X-Permitted-Cross-Domain-Policies
      permittedCrossDomainPolicies: false,

      // Referrer Policy
      referrerPolicy: { 
        policy: ['no-referrer', 'strict-origin-when-cross-origin']
      },

      // X-XSS-Protection
      xssFilter: true,
    },
  };
};

// Environment-specific overrides
export const getDevelopmentSecurityOverrides = (): Partial<SecurityConfig> => ({
  helmet: {
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https:'],
        'connect-src': ["'self'", 'ws:', 'wss:', 'http:', 'https:'],
        'img-src': ["'self'", 'data:', 'https:', 'http:'],
      },
    },
    hsts: {
      maxAge: 0, // Disable HSTS in development
      includeSubDomains: false,
      preload: false,
    },
  } as any,
});

export const getProductionSecurityOverrides = (): Partial<SecurityConfig> => ({
  helmet: {
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'strict-dynamic'"],
        'style-src': ["'self'", 'https:'],
        'connect-src': ["'self'", 'https:'],
        'img-src': ["'self'", 'data:', 'https:'],
        'upgrade-insecure-requests': [],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
  } as any,
});
