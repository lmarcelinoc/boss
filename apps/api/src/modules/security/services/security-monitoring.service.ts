import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Request } from 'express';

export interface SecurityEvent {
  type: SecurityEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  userId?: string;
  tenantId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  details: Record<string, any>;
  blocked: boolean;
}

export enum SecurityEventType {
  // Authentication events
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILED = 'login_failed',
  LOGIN_BRUTE_FORCE = 'login_brute_force',
  LOGOUT = 'logout',
  SESSION_EXPIRED = 'session_expired',
  
  // Authorization events
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  FORBIDDEN_RESOURCE = 'forbidden_resource',
  
  // Rate limiting events
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  RATE_LIMIT_WARNING = 'rate_limit_warning',
  
  // Security violations
  SUSPICIOUS_REQUEST = 'suspicious_request',
  MALICIOUS_PAYLOAD = 'malicious_payload',
  CSRF_ATTEMPT = 'csrf_attempt',
  XSS_ATTEMPT = 'xss_attempt',
  SQL_INJECTION_ATTEMPT = 'sql_injection_attempt',
  
  // Data protection events
  SENSITIVE_DATA_ACCESS = 'sensitive_data_access',
  MASS_DATA_EXPORT = 'mass_data_export',
  UNAUTHORIZED_FILE_ACCESS = 'unauthorized_file_access',
  
  // System events
  CONFIGURATION_CHANGED = 'configuration_changed',
  SECURITY_SCAN_DETECTED = 'security_scan_detected',
  VULNERABILITY_EXPLOIT = 'vulnerability_exploit',
  
  // Admin events
  ADMIN_ACTION = 'admin_action',
  USER_ROLE_CHANGED = 'user_role_changed',
  TENANT_ACCESS_GRANTED = 'tenant_access_granted',
  
  // File upload events
  MALICIOUS_FILE_UPLOAD = 'malicious_file_upload',
  OVERSIZED_FILE_UPLOAD = 'oversized_file_upload',
}

export interface SecurityThreat {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string; // IP address or user ID
  description: string;
  events: SecurityEvent[];
  firstSeen: Date;
  lastSeen: Date;
  count: number;
  blocked: boolean;
  resolved: boolean;
}

export interface SecurityMetrics {
  totalEvents: number;
  eventsLast24h: number;
  eventsLast7d: number;
  topThreats: SecurityThreat[];
  eventsByType: Record<SecurityEventType, number>;
  eventsBySeverity: Record<string, number>;
  blockedRequests: number;
  suspiciousIPs: string[];
}

/**
 * Security Monitoring Service
 * Tracks, analyzes, and responds to security events
 */
@Injectable()
export class SecurityMonitoringService {
  private readonly logger = new Logger(SecurityMonitoringService.name);
  private readonly events: SecurityEvent[] = []; // In production, use Redis or database
  private readonly threats: Map<string, SecurityThreat> = new Map();
  private readonly suspiciousIPs: Set<string> = new Set();
  private readonly blockedIPs: Set<string> = new Set();

  constructor(private readonly eventEmitter: EventEmitter2) {
    // Clean up old events periodically
    setInterval(() => this.cleanupOldEvents(), 60 * 60 * 1000); // Every hour
  }

  /**
   * Log a security event
   */
  async logSecurityEvent(
    type: SecurityEventType,
    severity: 'low' | 'medium' | 'high' | 'critical',
    details: Record<string, any>,
    req?: Request,
    blocked: boolean = false
  ): Promise<void> {
    const event: SecurityEvent = {
      type,
      severity,
      timestamp: new Date(),
      userId: req?.['user']?.id,
      tenantId: req?.['tenantId'],
      ipAddress: this.getClientIP(req),
      userAgent: req?.get('User-Agent'),
      requestId: req?.['requestId'] || req?.get('X-Request-ID'),
      details,
      blocked,
    };

    // Store the event
    this.events.push(event);

    // Analyze for threats
    await this.analyzeForThreats(event);

    // Emit event for other services to handle
    this.eventEmitter.emit(`security.${type}`, event);
    this.eventEmitter.emit('security.event', event);

    // Log based on severity
    const message = `Security event: ${type} - ${JSON.stringify(details)}`;
    switch (severity) {
      case 'critical':
        this.logger.error(message, { event });
        break;
      case 'high':
        this.logger.warn(message, { event });
        break;
      case 'medium':
        this.logger.log(message, { event });
        break;
      case 'low':
        this.logger.debug(message, { event });
        break;
    }

    // Take immediate action for critical events
    if (severity === 'critical') {
      await this.handleCriticalEvent(event);
    }
  }

  /**
   * Check if an IP is blocked
   */
  isIPBlocked(ipAddress: string): boolean {
    return this.blockedIPs.has(ipAddress);
  }

  /**
   * Check if an IP is suspicious
   */
  isIPSuspicious(ipAddress: string): boolean {
    return this.suspiciousIPs.has(ipAddress);
  }

  /**
   * Block an IP address
   */
  async blockIP(ipAddress: string, reason: string, duration?: number): Promise<void> {
    this.blockedIPs.add(ipAddress);
    
    await this.logSecurityEvent(
      SecurityEventType.ADMIN_ACTION,
      'high',
      {
        action: 'block_ip',
        ipAddress,
        reason,
        duration: duration || 'permanent',
      },
      undefined,
      true
    );

    this.logger.warn(`Blocked IP address: ${ipAddress} (Reason: ${reason})`);

    // Auto-unblock after duration if specified
    if (duration) {
      setTimeout(() => {
        this.unblockIP(ipAddress);
      }, duration);
    }
  }

  /**
   * Unblock an IP address
   */
  async unblockIP(ipAddress: string): Promise<void> {
    this.blockedIPs.delete(ipAddress);
    this.suspiciousIPs.delete(ipAddress);
    
    await this.logSecurityEvent(
      SecurityEventType.ADMIN_ACTION,
      'medium',
      {
        action: 'unblock_ip',
        ipAddress,
      }
    );

    this.logger.log(`Unblocked IP address: ${ipAddress}`);
  }

  /**
   * Get security metrics
   */
  getSecurityMetrics(): SecurityMetrics {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const eventsLast24h = this.events.filter(e => e.timestamp >= last24h).length;
    const eventsLast7d = this.events.filter(e => e.timestamp >= last7d).length;

    const eventsByType: Record<SecurityEventType, number> = {} as Record<SecurityEventType, number>;
    const eventsBySeverity: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    this.events.forEach(event => {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      eventsBySeverity[event.severity]++;
    });

    const topThreats = Array.from(this.threats.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalEvents: this.events.length,
      eventsLast24h,
      eventsLast7d,
      topThreats,
      eventsByType,
      eventsBySeverity,
      blockedRequests: this.events.filter(e => e.blocked).length,
      suspiciousIPs: Array.from(this.suspiciousIPs),
    };
  }

  /**
   * Get events by type
   */
  getEventsByType(type: SecurityEventType, limit: number = 100): SecurityEvent[] {
    return this.events
      .filter(event => event.type === type)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get events by IP address
   */
  getEventsByIP(ipAddress: string, limit: number = 100): SecurityEvent[] {
    return this.events
      .filter(event => event.ipAddress === ipAddress)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get recent critical events
   */
  getCriticalEvents(hoursBack: number = 24): SecurityEvent[] {
    const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    return this.events
      .filter(event => event.severity === 'critical' && event.timestamp >= cutoff)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Analyze suspicious patterns
   */
  analyzeSuspiciousPatterns(): {
    bruteForceAttempts: { ip: string; count: number }[];
    rapidRequests: { ip: string; requestsPerMinute: number }[];
    suspiciousUserAgents: string[];
    frequentFailures: { userId: string; failures: number }[];
  } {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentEvents = this.events.filter(e => e.timestamp >= last24h);

    // Analyze brute force attempts
    const loginFailures = recentEvents.filter(e => e.type === SecurityEventType.LOGIN_FAILED);
    const bruteForceAttempts = this.groupAndCount(loginFailures, 'ipAddress')
      .filter(({ count }) => count >= 10)
      .sort((a, b) => b.count - a.count);

    // Analyze rapid requests
    const lastMinute = new Date(now.getTime() - 60 * 1000);
    const rapidRequests = this.groupAndCount(
      recentEvents.filter(e => e.timestamp >= lastMinute),
      'ipAddress'
    ).filter(({ count }) => count >= 60) // More than 1 request per second
      .map(({ key, count }) => ({ ip: key, requestsPerMinute: count }));

    // Analyze suspicious user agents
    const suspiciousUserAgents = Array.from(new Set(
      recentEvents
        .filter(e => this.isSuspiciousUserAgent(e.userAgent))
        .map(e => e.userAgent)
        .filter(Boolean)
    ));

    // Analyze frequent failures by user
    const authFailures = recentEvents.filter(e => 
      e.type === SecurityEventType.LOGIN_FAILED ||
      e.type === SecurityEventType.UNAUTHORIZED_ACCESS
    );
    const frequentFailures = this.groupAndCount(authFailures, 'userId')
      .filter(({ count }) => count >= 5)
      .map(({ key, count }) => ({ userId: key, failures: count }))
      .sort((a, b) => b.failures - a.failures);

    return {
      bruteForceAttempts,
      rapidRequests,
      suspiciousUserAgents,
      frequentFailures,
    };
  }

  /**
   * Clear security events
   */
  clearEvents(): void {
    this.events.length = 0;
    this.threats.clear();
    this.logger.log('Security events cleared');
  }

  /**
   * Get blocked IPs list
   */
  getBlockedIPs(): string[] {
    return Array.from(this.blockedIPs);
  }

  /**
   * Extract client IP from request
   */
  private getClientIP(req?: Request): string | undefined {
    if (!req) return undefined;
    
    return (req.get('X-Forwarded-For') || 
            req.get('X-Real-IP') || 
            req.connection?.remoteAddress ||
            req.socket?.remoteAddress ||
            req.ip)?.split(',')[0]?.trim();
  }

  /**
   * Analyze events for threats
   */
  private async analyzeForThreats(event: SecurityEvent): Promise<void> {
    const sourceKey = event.ipAddress || event.userId || 'unknown';
    
    let threat = this.threats.get(sourceKey);
    if (!threat) {
      threat = {
        id: sourceKey,
        type: 'unknown',
        severity: 'low',
        source: sourceKey,
        description: 'Suspicious activity detected',
        events: [],
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        count: 0,
        blocked: false,
        resolved: false,
      };
      this.threats.set(sourceKey, threat);
    }

    threat.events.push(event);
    threat.lastSeen = event.timestamp;
    threat.count++;

    // Determine threat type and severity
    if (event.type === SecurityEventType.LOGIN_FAILED && threat.count >= 5) {
      threat.type = 'brute_force';
      threat.severity = 'high';
      threat.description = `Brute force attack detected (${threat.count} failed login attempts)`;
      
      if (event.ipAddress) {
        this.suspiciousIPs.add(event.ipAddress);
      }
    }

    if (event.type === SecurityEventType.RATE_LIMIT_EXCEEDED && threat.count >= 3) {
      threat.type = 'rate_limit_abuse';
      threat.severity = 'medium';
      threat.description = `Rate limit abuse detected (${threat.count} violations)`;
    }

    // Auto-block for critical threats
    if (threat.severity === 'critical' && !threat.blocked && event.ipAddress) {
      await this.blockIP(event.ipAddress, `Critical threat: ${threat.description}`, 24 * 60 * 60 * 1000); // 24 hours
      threat.blocked = true;
    }
  }

  /**
   * Handle critical security events
   */
  private async handleCriticalEvent(event: SecurityEvent): Promise<void> {
    // Immediate actions for critical events
    switch (event.type) {
      case SecurityEventType.VULNERABILITY_EXPLOIT:
        if (event.ipAddress) {
          await this.blockIP(event.ipAddress, 'Vulnerability exploit detected');
        }
        break;
      
      case SecurityEventType.SQL_INJECTION_ATTEMPT:
      case SecurityEventType.XSS_ATTEMPT:
        if (event.ipAddress) {
          await this.blockIP(event.ipAddress, 'Malicious payload detected');
        }
        break;
      
      case SecurityEventType.LOGIN_BRUTE_FORCE:
        if (event.ipAddress) {
          await this.blockIP(event.ipAddress, 'Brute force attack', 60 * 60 * 1000); // 1 hour
        }
        break;
    }

    // Notify administrators (implement as needed)
    this.eventEmitter.emit('security.critical', event);
  }

  /**
   * Clean up old events
   */
  private cleanupOldEvents(): void {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days
    const initialLength = this.events.length;
    
    // Remove old events
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].timestamp < cutoff) {
        this.events.splice(i, 1);
      }
    }

    if (initialLength !== this.events.length) {
      this.logger.log(`Cleaned up ${initialLength - this.events.length} old security events`);
    }
  }

  /**
   * Check if user agent is suspicious
   */
  private isSuspiciousUserAgent(userAgent?: string): boolean {
    if (!userAgent) return false;
    
    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scanner/i,
      /sqlmap/i,
      /nikto/i,
      /nmap/i,
      /masscan/i,
      /zap/i,
      /burp/i,
    ];

    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }

  /**
   * Group events and count by a property
   */
  private groupAndCount<T extends Record<string, any>>(
    items: T[], 
    property: keyof T
  ): { key: string; count: number }[] {
    const groups = items.reduce((acc, item) => {
      const key = String(item[property] || 'unknown');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(groups).map(([key, count]) => ({ key, count }));
  }
}
