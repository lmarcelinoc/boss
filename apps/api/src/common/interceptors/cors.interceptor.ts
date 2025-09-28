import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { getSecurityConfig } from '../../config/security.config';

@Injectable()
export class CorsInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CorsInterceptor.name);
  private readonly corsConfig = getSecurityConfig().cors;

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Apply CORS headers manually for fine-grained control
    this.applyCorsHeaders(request, response);

    return next.handle().pipe(
      tap(() => {
        // Log CORS information for debugging
        this.logger.debug(
          `CORS headers applied for ${request.method} ${request.url} from origin ${request.headers.origin}`
        );
      })
    );
  }

  private applyCorsHeaders(request: any, response: any): void {
    const origin = request.headers.origin;
    const requestMethod = request.headers['access-control-request-method'];
    const requestHeaders = request.headers['access-control-request-headers'];

    // Set Access-Control-Allow-Origin
    if (this.isOriginAllowed(origin)) {
      response.setHeader('Access-Control-Allow-Origin', origin || '*');
      response.setHeader('Vary', 'Origin');
    }

    // Set Access-Control-Allow-Credentials
    if (this.corsConfig.credentials) {
      response.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      // Set Access-Control-Allow-Methods
      if (requestMethod && this.corsConfig.methods?.includes(requestMethod)) {
        response.setHeader(
          'Access-Control-Allow-Methods',
          Array.isArray(this.corsConfig.methods) 
            ? this.corsConfig.methods.join(', ')
            : this.corsConfig.methods
        );
      }

      // Set Access-Control-Allow-Headers
      if (requestHeaders) {
        const allowedHeaders = this.getMatchingHeaders(requestHeaders);
        if (allowedHeaders.length > 0) {
          response.setHeader(
            'Access-Control-Allow-Headers',
            allowedHeaders.join(', ')
          );
        }
      }

      // Set Access-Control-Max-Age
      if (this.corsConfig.maxAge) {
        response.setHeader('Access-Control-Max-Age', this.corsConfig.maxAge);
      }

      // End the preflight request
      response.status(this.corsConfig.optionsSuccessStatus || 204);
      response.send();
      return;
    }

    // Set Access-Control-Expose-Headers for actual requests
    if (this.corsConfig.exposedHeaders && this.corsConfig.exposedHeaders.length > 0) {
      response.setHeader(
        'Access-Control-Expose-Headers',
        Array.isArray(this.corsConfig.exposedHeaders)
          ? this.corsConfig.exposedHeaders.join(', ')
          : this.corsConfig.exposedHeaders
      );
    }
  }

  private isOriginAllowed(origin: string): boolean {
    if (!origin) return true; // Same-origin requests

    // If corsConfig.origin is a function, use it
    if (typeof this.corsConfig.origin === 'function') {
      return new Promise((resolve) => {
        (this.corsConfig.origin as Function)(origin, (err: Error | null, allowed: boolean) => {
          resolve(!err && allowed);
        });
      }) as any;
    }

    // If corsConfig.origin is true, allow all origins
    if (this.corsConfig.origin === true) {
      return true;
    }

    // If corsConfig.origin is false, deny all origins
    if (this.corsConfig.origin === false) {
      return false;
    }

    // If corsConfig.origin is a string or array, check against it
    if (Array.isArray(this.corsConfig.origin)) {
      return this.corsConfig.origin.includes(origin);
    }

    if (typeof this.corsConfig.origin === 'string') {
      return this.corsConfig.origin === origin;
    }

    return false;
  }

  private getMatchingHeaders(requestHeaders: string): string[] {
    if (!this.corsConfig.allowedHeaders) return [];

    const requestedHeaders = requestHeaders
      .split(',')
      .map(h => h.trim().toLowerCase());

    const allowedHeaders = Array.isArray(this.corsConfig.allowedHeaders)
      ? this.corsConfig.allowedHeaders.map((h: string) => h.toLowerCase())
      : [this.corsConfig.allowedHeaders].filter(Boolean).map((h: string) => h.toLowerCase());

    return requestedHeaders.filter(header =>
      allowedHeaders.includes(header) ||
      header.startsWith('x-') || // Allow custom X- headers
      ['accept', 'content-type', 'authorization'].includes(header) // Always allow basic headers
    );
  }
}
