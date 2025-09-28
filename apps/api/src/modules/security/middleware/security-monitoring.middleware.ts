import { Injectable, NestMiddleware, Logger, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { SecurityMonitoringService, SecurityEventType } from '../services/security-monitoring.service';

/**
 * Security Monitoring Middleware
 * Monitors requests for suspicious activity and integrates with security monitoring
 */
@Injectable()
export class SecurityMonitoringMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SecurityMonitoringMiddleware.name);

  constructor(private readonly securityMonitoringService: SecurityMonitoringService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const clientIP = this.getClientIP(req);
    
    // Check if IP is blocked
    if (clientIP && this.securityMonitoringService.isIPBlocked(clientIP)) {
      await this.securityMonitoringService.logSecurityEvent(
        SecurityEventType.SUSPICIOUS_REQUEST,
        'high',
        {
          reason: 'Blocked IP attempted access',
          url: req.url,
          method: req.method,
        },
        req,
        true
      );

      throw new ForbiddenException('Access denied from this IP address');
    }

    // Analyze request for suspicious patterns
    await this.analyzeRequest(req);

    // Continue with the request
    next();
  }

  /**
   * Analyze incoming request for suspicious patterns
   */
  private async analyzeRequest(req: Request): Promise<void> {
    const userAgent = req.get('User-Agent');
    const url = req.url;
    const method = req.method;
    const clientIP = this.getClientIP(req);

    // Check for suspicious user agents
    if (this.isSuspiciousUserAgent(userAgent)) {
      await this.securityMonitoringService.logSecurityEvent(
        SecurityEventType.SUSPICIOUS_REQUEST,
        'medium',
        {
          reason: 'Suspicious user agent',
          userAgent,
          url,
          method,
        },
        req
      );
    }

    // Check for potential attack patterns in URL
    if (this.hasSuspiciousUrlPattern(url)) {
      await this.securityMonitoringService.logSecurityEvent(
        SecurityEventType.SUSPICIOUS_REQUEST,
        'high',
        {
          reason: 'Suspicious URL pattern',
          url,
          method,
        },
        req
      );
    }

    // Check for SQL injection attempts
    if (this.hasSqlInjectionPattern(req)) {
      await this.securityMonitoringService.logSecurityEvent(
        SecurityEventType.SQL_INJECTION_ATTEMPT,
        'critical',
        {
          reason: 'SQL injection pattern detected',
          url,
          method,
          query: req.query,
          body: this.sanitizeForLogging(req.body),
        },
        req
      );
    }

    // Check for XSS attempts
    if (this.hasXssPattern(req)) {
      await this.securityMonitoringService.logSecurityEvent(
        SecurityEventType.XSS_ATTEMPT,
        'critical',
        {
          reason: 'XSS pattern detected',
          url,
          method,
          query: req.query,
          body: this.sanitizeForLogging(req.body),
        },
        req
      );
    }

    // Check for suspicious headers
    const suspiciousHeaders = this.analyzeSuspiciousHeaders(req);
    if (suspiciousHeaders.length > 0) {
      await this.securityMonitoringService.logSecurityEvent(
        SecurityEventType.SUSPICIOUS_REQUEST,
        'medium',
        {
          reason: 'Suspicious headers detected',
          suspiciousHeaders,
          url,
          method,
        },
        req
      );
    }

    // Check for oversized requests (potential DoS)
    const contentLength = parseInt(req.get('Content-Length') || '0', 10);
    if (contentLength > 10 * 1024 * 1024) { // 10MB
      await this.securityMonitoringService.logSecurityEvent(
        SecurityEventType.SUSPICIOUS_REQUEST,
        'medium',
        {
          reason: 'Oversized request',
          contentLength,
          url,
          method,
        },
        req
      );
    }
  }

  /**
   * Check if user agent is suspicious
   */
  private isSuspiciousUserAgent(userAgent?: string): boolean {
    if (!userAgent) return false;

    const suspiciousPatterns = [
      // Common attack tools
      /sqlmap/i,
      /nikto/i,
      /nmap/i,
      /masscan/i,
      /zap/i,
      /burp/i,
      /w3af/i,
      /acunetix/i,
      /nessus/i,
      /openvas/i,
      
      // Suspicious bots
      /bot.*(?:attack|scan|hack|exploit)/i,
      /crawler.*(?:attack|scan|hack)/i,
      
      // Empty or very short user agents
      /^.{0,5}$/,
      
      // Common malicious patterns
      /(?:select|union|insert|delete|drop|create|alter)\s+/i,
      /<script[^>]*>/i,
      /javascript:/i,
      /vbscript:/i,
      
      // Suspicious command patterns
      /\b(?:wget|curl|python|perl|php|ruby|java|nc|netcat|bash|sh|cmd|powershell)\b/i,
    ];

    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }

  /**
   * Check for suspicious URL patterns
   */
  private hasSuspiciousUrlPattern(url: string): boolean {
    const suspiciousPatterns = [
      // Directory traversal
      /\.\.[\/\\]/,
      /\.\.[%2f%5c]/i,
      
      // Common attack paths
      /\/(?:admin|administrator|wp-admin|phpmyadmin|cpanel)/i,
      /\/(?:etc\/passwd|windows\/system32)/i,
      
      // File inclusion
      /(?:file|http|ftp|https):/i,
      /\?.*(?:file|page|include|require)=.*(?:http|ftp|file):/i,
      
      // Command injection
      /[;&|`$(){}]/,
      /(?:cmd|command|exec|system|shell)/i,
      
      // Common exploit paths
      /\/(?:wp-content\/uploads|uploads|temp|tmp)\/.*\.php/i,
      /\.(?:exe|bat|cmd|com|pif|scr|vbs|js|jar|app)$/i,
    ];

    return suspiciousPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Check for SQL injection patterns
   */
  private hasSqlInjectionPattern(req: Request): boolean {
    const sqlPatterns = [
      // Common SQL injection patterns
      /('|(\\')|(;)|(\-\-)|(\+)|(\|\|)/,
      /(union\s+select|select\s+.*\s+from|insert\s+into|delete\s+from|update\s+.*\s+set)/i,
      /(or\s+1\s*=\s*1|and\s+1\s*=\s*1)/i,
      /(drop\s+table|truncate\s+table|alter\s+table)/i,
      /(exec|execute|sp_|xp_)/i,
      /(information_schema|sys\.databases|mysql\.user)/i,
      /(\bhex\b|\bchar\b|\bascii\b|\border\s+by\b|\bgroup\s+by\b)/i,
    ];

    // Check URL parameters
    const urlParams = new URLSearchParams(req.url.split('?')[1] || '');
    for (const [, value] of urlParams) {
      if (sqlPatterns.some(pattern => pattern.test(value))) {
        return true;
      }
    }

    // Check query parameters
    if (req.query) {
      for (const value of Object.values(req.query)) {
        if (typeof value === 'string' && sqlPatterns.some(pattern => pattern.test(value))) {
          return true;
        }
      }
    }

    // Check request body
    if (req.body && typeof req.body === 'object') {
      const bodyStr = JSON.stringify(req.body);
      if (sqlPatterns.some(pattern => pattern.test(bodyStr))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check for XSS patterns
   */
  private hasXssPattern(req: Request): boolean {
    const xssPatterns = [
      // Basic XSS patterns
      /<script[^>]*>[\s\S]*?<\/script>/i,
      /<iframe[^>]*>[\s\S]*?<\/iframe>/i,
      /<object[^>]*>[\s\S]*?<\/object>/i,
      /<embed[^>]*>/i,
      /<form[^>]*>[\s\S]*?<\/form>/i,
      
      // Event handlers
      /on(?:load|click|mouse|focus|blur|change|submit|resize|scroll|unload|error)=["'][^"']*["']/i,
      
      // JavaScript pseudo-protocol
      /javascript:\s*[^;]+/i,
      /vbscript:\s*[^;]+/i,
      
      // Data URLs with scripts
      /data:\s*text\/html[^,]*,[\s\S]*<script/i,
      
      // Expression and eval
      /expression\s*\(/i,
      /eval\s*\(/i,
      
      // Common XSS vectors
      /alert\s*\(/i,
      /confirm\s*\(/i,
      /prompt\s*\(/i,
      /document\.(write|writeln|cookie|location)/i,
      /window\.(open|location|navigate)/i,
    ];

    // Check URL parameters
    const urlParams = new URLSearchParams(req.url.split('?')[1] || '');
    for (const [, value] of urlParams) {
      if (xssPatterns.some(pattern => pattern.test(value))) {
        return true;
      }
    }

    // Check query parameters
    if (req.query) {
      for (const value of Object.values(req.query)) {
        if (typeof value === 'string' && xssPatterns.some(pattern => pattern.test(value))) {
          return true;
        }
      }
    }

    // Check request body
    if (req.body && typeof req.body === 'object') {
      const bodyStr = JSON.stringify(req.body);
      if (xssPatterns.some(pattern => pattern.test(bodyStr))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Analyze suspicious headers
   */
  private analyzeSuspiciousHeaders(req: Request): string[] {
    const suspiciousHeaders: string[] = [];
    const headers = req.headers;

    // Check for suspicious header values
    const suspiciousHeaderPatterns = {
      'x-forwarded-for': /(?:\b(?:127\.0\.0\.1|localhost|0\.0\.0\.0)\b.*,.*){3,}/, // IP spoofing
      'user-agent': /^.{0,5}$/, // Very short user agent
      'referer': /^https?:\/\/(?:127\.0\.0\.1|localhost)/, // Local referer from external
      'x-requested-with': /^(?!XMLHttpRequest$)/, // Unexpected X-Requested-With
    };

    for (const [headerName, pattern] of Object.entries(suspiciousHeaderPatterns)) {
      const headerValue = headers[headerName];
      if (headerValue && typeof headerValue === 'string' && pattern.test(headerValue)) {
        suspiciousHeaders.push(`${headerName}: ${headerValue}`);
      }
    }

    // Check for too many X-Forwarded-For entries (potential IP spoofing)
    const xForwardedFor = headers['x-forwarded-for'];
    if (xForwardedFor && typeof xForwardedFor === 'string') {
      const ips = xForwardedFor.split(',').map(ip => ip.trim());
      if (ips.length > 5) {
        suspiciousHeaders.push(`x-forwarded-for: Too many forwarded IPs (${ips.length})`);
      }
    }

    // Check for unexpected or suspicious custom headers
    const customHeaders = Object.keys(headers).filter(name => name.startsWith('x-') && 
      !['x-forwarded-for', 'x-real-ip', 'x-forwarded-proto', 'x-forwarded-host', 'x-requested-with', 'x-tenant-id', 'x-request-id'].includes(name));
    
    if (customHeaders.length > 3) {
      suspiciousHeaders.push(`Custom headers: Too many custom headers (${customHeaders.join(', ')})`);
    }

    return suspiciousHeaders;
  }

  /**
   * Sanitize sensitive data for logging
   */
  private sanitizeForLogging(data: any): any {
    if (!data) return data;

    const sanitized = JSON.parse(JSON.stringify(data));
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth', 'credential'];

    const sanitizeObject = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) return obj;

      for (const key in obj) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
          obj[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'object') {
          obj[key] = sanitizeObject(obj[key]);
        }
      }

      return obj;
    };

    return sanitizeObject(sanitized);
  }

  /**
   * Get client IP address
   */
  private getClientIP(req: Request): string | undefined {
    return (req.get('X-Forwarded-For') || 
            req.get('X-Real-IP') || 
            req.connection?.remoteAddress ||
            req.socket?.remoteAddress ||
            req.ip)?.split(',')[0]?.trim();
  }
}
