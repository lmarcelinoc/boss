import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap, catchError } from 'rxjs';
import { Request, Response } from 'express';
import { PrismaAuditService, AuditEventType, AuditEventStatus } from '../services/prisma-audit.service';
import { Reflector } from '@nestjs/core';

// Decorator to mark routes that should NOT be audited
export const SkipAudit = (skip: boolean = true) => {
  return (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      Reflect.defineMetadata('skipAudit', skip, descriptor.value);
    }
  };
};

interface ExtendedRequest extends Request {
  user?: {
    id: string;
    email: string;
    tenantId?: string;
  };
  tenantId?: string;
  sessionId?: string;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  // Routes that should not be audited for performance/noise reasons
  private readonly skipRoutes = new Set([
    '/health',
    '/api/docs',
    '/api/docs-json',
    'favicon.ico',
  ]);

  // HTTP methods that typically don't need auditing
  private readonly skipMethods = new Set(['HEAD', 'OPTIONS']);

  constructor(
    private readonly auditService: PrismaAuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<ExtendedRequest>();
    const response = httpContext.getResponse<Response>();

    // Check if this route should be skipped
    if (this.shouldSkipAudit(context, request)) {
      return next.handle();
    }

    const startTime = Date.now();
    const requestData = this.extractRequestData(request);

    return next.handle().pipe(
      tap(responseData => {
        // Log successful API calls (async - don't block response)
        this.logApiCall(request, response, requestData, responseData, startTime, AuditEventStatus.SUCCESS)
          .catch(error => {
            this.logger.error(`Failed to log successful API call: ${error.message}`);
          });
      }),
      catchError(error => {
        // Log failed API calls (async - don't block error handling)
        this.logApiCall(request, response, requestData, null, startTime, AuditEventStatus.FAILURE, error)
          .catch(logError => {
            this.logger.error(`Failed to log failed API call: ${logError.message}`);
          });

        // Re-throw the original error
        throw error;
      }),
    );
  }

  private shouldSkipAudit(context: ExecutionContext, request: ExtendedRequest): boolean {
    // Check method
    if (this.skipMethods.has(request.method)) {
      return true;
    }

    // Check route
    if (this.skipRoutes.has(request.url) || this.skipRoutes.has(request.path)) {
      return true;
    }

    // Check for skip decorator
    const skipAudit = this.reflector.get<boolean>('skipAudit', context.getHandler());
    if (skipAudit) {
      return true;
    }

    // Skip static files and assets
    if (request.url.includes('.') && !request.url.includes('/api/')) {
      return true;
    }

    return false;
  }

  private extractRequestData(request: ExtendedRequest): Record<string, any> {
    const data: Record<string, any> = {
      method: request.method,
      url: request.url,
      path: request.path,
      query: request.query,
      headers: {
        'user-agent': request.headers['user-agent'],
        'x-forwarded-for': request.headers['x-forwarded-for'],
        'authorization': request.headers.authorization ? '[REDACTED]' : undefined,
        'x-tenant-id': request.headers['x-tenant-id'],
        'x-request-id': request.headers['x-request-id'],
      },
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    };

    // Include body data for non-sensitive endpoints (excluding passwords, tokens, etc.)
    if (request.body && typeof request.body === 'object') {
      data.body = this.sanitizeRequestBody(request.body);
    }

    return data;
  }

  private sanitizeRequestBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sensitiveFields = new Set([
      'password',
      'currentPassword',
      'newPassword',
      'confirmPassword',
      'token',
      'accessToken',
      'refreshToken',
      'secret',
      'apiKey',
      'privateKey',
      'creditCard',
      'cardNumber',
      'cvv',
      'ssn',
    ]);

    const sanitized = { ...body };

    for (const key in sanitized) {
      if (sensitiveFields.has(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeRequestBody(sanitized[key]);
      }
    }

    return sanitized;
  }

  private async logApiCall(
    request: ExtendedRequest,
    response: Response,
    requestData: Record<string, any>,
    responseData: any,
    startTime: number,
    status: AuditEventStatus,
    error?: any,
  ): Promise<void> {
    try {
      const duration = Date.now() - startTime;
      const user = request.user;

      // Determine event type based on HTTP method and route
      const eventType = this.determineEventType(request.method, request.path);

      // Build audit log data
      const auditData = {
        eventType,
        userId: user?.id,
        userEmail: user?.email,
        tenantId: user?.tenantId || request.tenantId,
        sessionId: request.sessionId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        description: `${request.method} ${request.path}`,
        requestData,
        responseData: status === AuditEventStatus.SUCCESS 
          ? this.sanitizeResponseData(responseData) 
          : undefined,
        errorCode: error?.status?.toString(),
        errorMessage: error?.message,
        metadata: {
          duration,
          statusCode: response.statusCode,
          contentLength: response.get('content-length'),
          userAgent: request.headers['user-agent'],
          referer: request.headers.referer,
        },
        status,
        severity: this.determineSeverity(request.method, request.path, status),
        source: 'api-interceptor',
      };

      await this.auditService.logEvent(auditData, request);
    } catch (logError) {
      this.logger.error(
        `Failed to log API audit event: ${(logError as Error).message}`,
        (logError as Error).stack,
      );
    }
  }

  private determineEventType(method: string, path: string): AuditEventType {
    // Authentication routes
    if (path.includes('/auth/login')) return AuditEventType.USER_LOGIN;
    if (path.includes('/auth/logout')) return AuditEventType.USER_LOGOUT;
    if (path.includes('/auth/register')) return AuditEventType.USER_REGISTERED;

    // Password routes
    if (path.includes('/auth/change-password')) return AuditEventType.PASSWORD_CHANGED;
    if (path.includes('/auth/forgot-password')) return AuditEventType.PASSWORD_RESET_REQUESTED;
    if (path.includes('/auth/reset-password')) return AuditEventType.PASSWORD_RESET_COMPLETED;

    // MFA routes
    if (path.includes('/mfa/enable')) return AuditEventType.MFA_ENABLED;
    if (path.includes('/mfa/disable')) return AuditEventType.MFA_DISABLED;
    if (path.includes('/mfa/verify')) return AuditEventType.MFA_VERIFIED;

    // User management
    if (path.includes('/users') && method === 'POST') return AuditEventType.USER_CREATED;
    if (path.includes('/users') && (method === 'PUT' || method === 'PATCH')) return AuditEventType.USER_UPDATED;
    if (path.includes('/users') && method === 'DELETE') return AuditEventType.USER_DELETED;

    // Tenant management
    if (path.includes('/tenants') && method === 'POST') return AuditEventType.TENANT_CREATED;
    if (path.includes('/tenants') && (method === 'PUT' || method === 'PATCH')) return AuditEventType.TENANT_UPDATED;
    if (path.includes('/tenants') && method === 'DELETE') return AuditEventType.TENANT_DELETED;

    // Role management
    if (path.includes('/roles') && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      return AuditEventType.ROLE_ASSIGNED;
    }

    // File operations
    if (path.includes('/files') && method === 'POST') return AuditEventType.FILE_UPLOADED;
    if (path.includes('/files') && method === 'GET') return AuditEventType.FILE_DOWNLOADED;
    if (path.includes('/files') && method === 'DELETE') return AuditEventType.FILE_DELETED;

    // Billing events
    if (path.includes('/subscriptions')) return AuditEventType.SUBSCRIPTION_UPDATED;
    if (path.includes('/billing/payment')) return AuditEventType.PAYMENT_SUCCEEDED;

    // Default to admin action for other protected routes
    if (path.includes('/admin')) return AuditEventType.ADMIN_ACTION;

    // Generic event type for other API calls
    return AuditEventType.USER_LOGIN; // Using this as a generic API access event
  }

  private determineSeverity(method: string, path: string, status: AuditEventStatus): string {
    // Critical operations
    if (path.includes('/users') && method === 'DELETE') return 'CRITICAL';
    if (path.includes('/tenants') && method === 'DELETE') return 'CRITICAL';
    if (path.includes('/admin/system')) return 'CRITICAL';

    // High severity operations
    if (path.includes('/auth/') || path.includes('/mfa/')) return 'HIGH';
    if (path.includes('/roles') || path.includes('/permissions')) return 'HIGH';
    if (status === AuditEventStatus.FAILURE) return 'HIGH';

    // Medium severity operations
    if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
      return 'MEDIUM';
    }

    // Low severity for read operations
    return 'LOW';
  }

  private sanitizeResponseData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    // For large responses, just log metadata
    if (Array.isArray(data) && data.length > 10) {
      return {
        type: 'array',
        length: data.length,
        sample: data.slice(0, 2),
      };
    }

    // For objects with sensitive data, sanitize
    const sensitiveFields = new Set([
      'password',
      'token',
      'accessToken',
      'refreshToken',
      'secret',
      'apiKey',
      'privateKey',
    ]);

    if (typeof data === 'object' && data !== null) {
      const sanitized = { ...data };
      
      for (const key in sanitized) {
        if (sensitiveFields.has(key.toLowerCase())) {
          sanitized[key] = '[REDACTED]';
        }
      }

      return sanitized;
    }

    return data;
  }
}
