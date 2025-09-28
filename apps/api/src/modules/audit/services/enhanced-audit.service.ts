import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Request } from 'express';
import { PrismaService } from '../../../database/prisma.service';
import { AuditLog, User } from '@prisma/client';
import {
  AuditEventType,
  AuditEventStatus,
  AuditEventSeverity,
} from '../entities/audit-log.entity';
import { 
  SecurityMonitoringService, 
  SecurityEvent, 
  SecurityEventType 
} from '../../security/services/security-monitoring.service';

export interface EnhancedAuditLogData {
  eventType: AuditEventType;
  userId?: string;
  tenantId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  userEmail?: string;
  targetUserId?: string;
  targetUserEmail?: string;
  description?: string;
  metadata?: Record<string, any>;
  requestData?: Record<string, any>;
  responseData?: Record<string, any>;
  errorCode?: string;
  errorMessage?: string;
  source?: string;
  severity?: AuditEventSeverity;
  status?: AuditEventStatus;
  resourceType?: string;
  resourceId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
}

/**
 * Enhanced Audit Service
 * Comprehensive audit logging with security integration
 */
@Injectable()
export class EnhancedAuditService {
  private readonly logger = new Logger(EnhancedAuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly securityMonitoringService: SecurityMonitoringService,
  ) {}

  /**
   * Main audit logging method
   */
  async logEvent(data: EnhancedAuditLogData, req?: Request): Promise<AuditLog> {
    try {
      // Extract additional data from request if provided
      if (req) {
        data.ipAddress = data.ipAddress || this.getClientIP(req);
        data.userAgent = data.userAgent || req.get('User-Agent');
        data.source = data.source || 'api';
        
        // Add request ID if available
        const requestId = req.get('X-Request-ID');
        if (requestId) {
          data.metadata = { ...data.metadata, requestId };
        }
      }

      // Create audit log entry
      const auditLog = await this.prisma.auditLog.create({
        data: {
          eventType: data.eventType,
          userId: data.userId || null,
          tenantId: data.tenantId || null,
          sessionId: data.sessionId || null,
          ipAddress: data.ipAddress || null,
          userAgent: data.userAgent || null,
          userEmail: data.userEmail || null,
          targetUserId: data.targetUserId || null,
          targetUserEmail: data.targetUserEmail || null,
          description: data.description || '',
          metadata: data.metadata ? JSON.stringify(data.metadata) : null,
          requestData: data.requestData ? JSON.stringify(data.requestData) : null,
          responseData: data.responseData ? JSON.stringify(data.responseData) : null,
          errorCode: data.errorCode || null,
          errorMessage: data.errorMessage || null,
          source: data.source || 'unknown',
          severity: data.severity || AuditEventSeverity.LOW,
          status: data.status || AuditEventStatus.SUCCESS,
          resourceType: data.resourceType || null,
          resourceId: data.resourceId || null,
          oldValues: data.oldValues ? JSON.stringify(data.oldValues) : null,
          newValues: data.newValues ? JSON.stringify(data.newValues) : null,
        },
      });

      // Analyze for suspicious activity and create security events
      await this.analyzeAndCreateSecurityEvent(auditLog, req);

      // Emit audit event for other services
      this.eventEmitter.emit('audit.logged', auditLog);

      this.logger.debug(
        `Audit log created: ${data.eventType} for user: ${data.userEmail || data.userId}`
      );

      return auditLog;
    } catch (error) {
      this.logger.error(
        `Failed to create audit log: ${(error as Error).message}`,
        (error as Error).stack
      );
      throw error;
    }
  }

  /**
   * Log authentication events
   */
  async logAuthEvent(
    eventType: AuditEventType,
    user: User | null,
    success: boolean,
    req?: Request,
    metadata?: Record<string, any>
  ): Promise<AuditLog> {
    const severity = this.getAuthEventSeverity(eventType, success);
    const status = success ? AuditEventStatus.SUCCESS : AuditEventStatus.FAILURE;

    return this.logEvent({
      eventType,
      userId: user?.id,
      tenantId: user?.tenantId,
      userEmail: user?.email,
      description: this.getAuthEventDescription(eventType, user?.email, success),
      metadata,
      severity,
      status,
    }, req);
  }

  /**
   * Log user login
   */
  async logUserLogin(user: User, req?: Request, metadata?: Record<string, any>): Promise<AuditLog> {
    // Also log to security monitoring
    await this.securityMonitoringService.logSecurityEvent(
      SecurityEventType.LOGIN_SUCCESS,
      'low',
      {
        userId: user.id,
        email: user.email,
        tenantId: user.tenantId,
        lastLoginAt: user.lastLoginAt,
        ...metadata,
      },
      req
    );

    return this.logAuthEvent(AuditEventType.USER_LOGIN, user, true, req, {
      lastLoginAt: user.lastLoginAt,
      ...metadata,
    });
  }

  /**
   * Log failed login
   */
  async logLoginFailed(email: string, reason: string, req?: Request): Promise<AuditLog> {
    // Also log to security monitoring
    await this.securityMonitoringService.logSecurityEvent(
      SecurityEventType.LOGIN_FAILED,
      'medium',
      {
        email,
        reason,
      },
      req
    );

    return this.logEvent({
      eventType: AuditEventType.LOGIN_FAILED,
      userEmail: email,
      description: `Login failed for: ${email}`,
      errorMessage: reason,
      metadata: { failedEmail: email, reason },
      severity: AuditEventSeverity.MEDIUM,
      status: AuditEventStatus.FAILURE,
    }, req);
  }

  /**
   * Log user logout
   */
  async logUserLogout(user: User, sessionId?: string, req?: Request): Promise<AuditLog> {
    // Also log to security monitoring
    await this.securityMonitoringService.logSecurityEvent(
      SecurityEventType.LOGOUT,
      'low',
      {
        userId: user.id,
        email: user.email,
        sessionId,
      },
      req
    );

    return this.logEvent({
      eventType: AuditEventType.USER_LOGOUT,
      userId: user.id,
      tenantId: user.tenantId,
      sessionId,
      userEmail: user.email,
      description: `User logged out: ${user.email}`,
      severity: AuditEventSeverity.LOW,
      status: AuditEventStatus.SUCCESS,
    }, req);
  }

  /**
   * Log role changes
   */
  async logRoleChange(
    userId: string,
    tenantId: string,
    oldRoles: string[],
    newRoles: string[],
    changedBy: User,
    req?: Request
  ): Promise<AuditLog> {
    // Also log to security monitoring
    await this.securityMonitoringService.logSecurityEvent(
      SecurityEventType.USER_ROLE_CHANGED,
      'high',
      {
        userId,
        tenantId,
        oldRoles,
        newRoles,
        changedById: changedBy.id,
        changedByEmail: changedBy.email,
      },
      req
    );

    return this.logEvent({
      eventType: AuditEventType.ROLE_ASSIGNED,
      userId: changedBy.id,
      tenantId,
      userEmail: changedBy.email,
      targetUserId: userId,
      description: `User roles changed from [${oldRoles.join(', ')}] to [${newRoles.join(', ')}]`,
      metadata: {
        oldRoles,
        newRoles,
        addedRoles: newRoles.filter(role => !oldRoles.includes(role)),
        removedRoles: oldRoles.filter(role => !newRoles.includes(role)),
      },
      oldValues: { roles: oldRoles },
      newValues: { roles: newRoles },
      severity: AuditEventSeverity.HIGH,
      status: AuditEventStatus.SUCCESS,
    }, req);
  }

  /**
   * Log permission changes
   */
  async logPermissionChange(
    resourceType: string,
    resourceId: string,
    userId: string,
    tenantId: string,
    oldPermissions: string[],
    newPermissions: string[],
    changedBy: User,
    req?: Request
  ): Promise<AuditLog> {
    return this.logEvent({
      eventType: AuditEventType.PERMISSION_GRANTED,
      userId: changedBy.id,
      tenantId,
      userEmail: changedBy.email,
      targetUserId: userId,
      description: `Permissions changed for ${resourceType}:${resourceId}`,
      resourceType,
      resourceId,
      metadata: {
        oldPermissions,
        newPermissions,
        addedPermissions: newPermissions.filter(perm => !oldPermissions.includes(perm)),
        removedPermissions: oldPermissions.filter(perm => !newPermissions.includes(perm)),
      },
      oldValues: { permissions: oldPermissions },
      newValues: { permissions: newPermissions },
      severity: AuditEventSeverity.HIGH,
      status: AuditEventStatus.SUCCESS,
    }, req);
  }

  /**
   * Log data access events
   */
  async logDataAccess(
    resourceType: string,
    resourceId: string,
    action: 'create' | 'read' | 'update' | 'delete',
    user: User,
    req?: Request,
    metadata?: Record<string, any>
  ): Promise<AuditLog> {
    const eventType = this.getDataAccessEventType(action);
    const severity = this.getDataAccessSeverity(action, resourceType);

    // Log sensitive data access to security monitoring
    if (this.isSensitiveResource(resourceType) || action === 'delete') {
      await this.securityMonitoringService.logSecurityEvent(
        SecurityEventType.SENSITIVE_DATA_ACCESS,
        severity === AuditEventSeverity.HIGH ? 'high' : 'medium',
        {
          userId: user.id,
          email: user.email,
          resourceType,
          resourceId,
          action,
          ...metadata,
        },
        req
      );
    }

    return this.logEvent({
      eventType,
      userId: user.id,
      tenantId: user.tenantId,
      userEmail: user.email,
      description: `${action.toUpperCase()} ${resourceType}:${resourceId}`,
      resourceType,
      resourceId,
      metadata: {
        action,
        ...metadata,
      },
      severity,
      status: AuditEventStatus.SUCCESS,
    }, req);
  }

  /**
   * Log bulk operations
   */
  async logBulkOperation(
    operation: string,
    resourceType: string,
    count: number,
    user: User,
    req?: Request,
    metadata?: Record<string, any>
  ): Promise<AuditLog> {
    // Log bulk operations to security monitoring
    await this.securityMonitoringService.logSecurityEvent(
      SecurityEventType.MASS_DATA_EXPORT,
      count > 1000 ? 'high' : 'medium',
      {
        userId: user.id,
        email: user.email,
        operation,
        resourceType,
        count,
        ...metadata,
      },
      req
    );

    return this.logEvent({
      eventType: AuditEventType.BULK_OPERATION,
      userId: user.id,
      tenantId: user.tenantId,
      userEmail: user.email,
      description: `Bulk ${operation} of ${count} ${resourceType} records`,
      resourceType,
      metadata: {
        operation,
        count,
        ...metadata,
      },
      severity: count > 1000 ? AuditEventSeverity.HIGH : AuditEventSeverity.MEDIUM,
      status: AuditEventStatus.SUCCESS,
    }, req);
  }

  /**
   * Log admin actions
   */
  async logAdminAction(
    action: string,
    targetUserId: string | null,
    admin: User,
    req?: Request,
    metadata?: Record<string, any>
  ): Promise<AuditLog> {
    // Also log to security monitoring
    await this.securityMonitoringService.logSecurityEvent(
      SecurityEventType.ADMIN_ACTION,
      'high',
      {
        adminId: admin.id,
        adminEmail: admin.email,
        action,
        targetUserId,
        ...metadata,
      },
      req
    );

    return this.logEvent({
      eventType: AuditEventType.ADMIN_ACTION,
      userId: admin.id,
      tenantId: admin.tenantId,
      userEmail: admin.email,
      targetUserId,
      description: `Admin action: ${action}`,
      metadata: {
        action,
        ...metadata,
      },
      severity: AuditEventSeverity.HIGH,
      status: AuditEventStatus.SUCCESS,
    }, req);
  }

  /**
   * Get audit logs with comprehensive filtering
   */
  async getAuditLogs(filters: {
    userId?: string;
    tenantId?: string;
    eventType?: AuditEventType;
    status?: AuditEventStatus;
    severity?: AuditEventSeverity;
    startDate?: Date;
    endDate?: Date;
    resourceType?: string;
    resourceId?: string;
    ipAddress?: string;
    userEmail?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditLog[]; total: number }> {
    const whereClause: any = {};

    if (filters.userId) whereClause.userId = filters.userId;
    if (filters.tenantId) whereClause.tenantId = filters.tenantId;
    if (filters.eventType) whereClause.eventType = filters.eventType;
    if (filters.status) whereClause.status = filters.status;
    if (filters.severity) whereClause.severity = filters.severity;
    if (filters.resourceType) whereClause.resourceType = filters.resourceType;
    if (filters.resourceId) whereClause.resourceId = filters.resourceId;
    if (filters.ipAddress) whereClause.ipAddress = filters.ipAddress;
    if (filters.userEmail) whereClause.userEmail = filters.userEmail;

    if (filters.startDate || filters.endDate) {
      whereClause.createdAt = {};
      if (filters.startDate) whereClause.createdAt.gte = filters.startDate;
      if (filters.endDate) whereClause.createdAt.lte = filters.endDate;
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip: filters.offset || 0,
        take: Math.min(filters.limit || 50, 100),
      }),
      this.prisma.auditLog.count({ where: whereClause }),
    ]);

    return { logs, total };
  }

  /**
   * Get audit statistics
   */
  async getAuditStatistics(tenantId?: string, days: number = 30): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsByStatus: Record<string, number>;
    eventsBySeverity: Record<string, number>;
    recentTrends: { date: string; count: number }[];
  }> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const whereClause: any = {
      createdAt: { gte: startDate },
    };

    if (tenantId) whereClause.tenantId = tenantId;

    const logs = await this.prisma.auditLog.findMany({
      where: whereClause,
      select: {
        eventType: true,
        status: true,
        severity: true,
        createdAt: true,
      },
    });

    const eventsByType: Record<string, number> = {};
    const eventsByStatus: Record<string, number> = {};
    const eventsBySeverity: Record<string, number> = {};
    const dailyCounts: Record<string, number> = {};

    logs.forEach(log => {
      eventsByType[log.eventType] = (eventsByType[log.eventType] || 0) + 1;
      eventsByStatus[log.status] = (eventsByStatus[log.status] || 0) + 1;
      eventsBySeverity[log.severity] = (eventsBySeverity[log.severity] || 0) + 1;

      const dateKey = log.createdAt.toISOString().split('T')[0];
      dailyCounts[dateKey] = (dailyCounts[dateKey] || 0) + 1;
    });

    const recentTrends = Object.entries(dailyCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalEvents: logs.length,
      eventsByType,
      eventsByStatus,
      eventsBySeverity,
      recentTrends,
    };
  }

  /**
   * Listen to security events and create audit logs
   */
  @OnEvent('security.*')
  async handleSecurityEvent(event: SecurityEvent): Promise<void> {
    try {
      const auditEventType = this.mapSecurityEventToAuditEvent(event.type);
      if (auditEventType) {
        await this.logEvent({
          eventType: auditEventType,
          userId: event.userId,
          tenantId: event.tenantId,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          description: `Security event: ${event.type}`,
          metadata: {
            securityEventId: event.requestId,
            securityDetails: event.details,
            blocked: event.blocked,
          },
          severity: this.mapSeverityToAuditSeverity(event.severity),
          status: event.blocked ? AuditEventStatus.FAILURE : AuditEventStatus.WARNING,
        });
      }
    } catch (error) {
      this.logger.error('Error creating audit log from security event:', error);
    }
  }

  /**
   * Clean up old audit logs
   */
  async cleanupOldAuditLogs(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    
    const result = await this.prisma.auditLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });

    this.logger.log(`Cleaned up ${result.count} old audit logs older than ${retentionDays} days`);
    return result.count;
  }

  // Helper methods

  private async analyzeAndCreateSecurityEvent(auditLog: AuditLog, req?: Request): Promise<void> {
    // Create security events for certain audit events
    const securityEventMapping: Record<AuditEventType, SecurityEventType | null> = {
      [AuditEventType.LOGIN_FAILED]: SecurityEventType.LOGIN_FAILED,
      [AuditEventType.MFA_FAILED]: SecurityEventType.LOGIN_FAILED,
      [AuditEventType.UNAUTHORIZED_ACCESS]: SecurityEventType.UNAUTHORIZED_ACCESS,
      [AuditEventType.PRIVILEGE_ESCALATION]: SecurityEventType.PRIVILEGE_ESCALATION,
      [AuditEventType.SUSPICIOUS_ACTIVITY]: SecurityEventType.SUSPICIOUS_REQUEST,
      // Add more mappings as needed
      [AuditEventType.USER_LOGIN]: null, // Already handled in logUserLogin
      [AuditEventType.USER_LOGOUT]: null, // Already handled in logUserLogout
      [AuditEventType.ROLE_ASSIGNED]: null, // Already handled in logRoleChange
      [AuditEventType.ADMIN_ACTION]: null, // Already handled in logAdminAction
    } as any;

    const securityEventType = securityEventMapping[auditLog.eventType as AuditEventType];
    if (securityEventType) {
      await this.securityMonitoringService.logSecurityEvent(
        securityEventType,
        this.mapAuditSeverityToSecuritySeverity(auditLog.severity as AuditEventSeverity),
        {
          auditLogId: auditLog.id,
          eventType: auditLog.eventType,
          description: auditLog.description,
        },
        req,
        auditLog.status === AuditEventStatus.FAILURE
      );
    }
  }

  private getClientIP(req: Request): string | undefined {
    return (req.get('X-Forwarded-For') || 
            req.get('X-Real-IP') || 
            req.connection?.remoteAddress ||
            req.socket?.remoteAddress ||
            req.ip)?.split(',')[0]?.trim();
  }

  private getAuthEventSeverity(eventType: AuditEventType, success: boolean): AuditEventSeverity {
    if (!success) return AuditEventSeverity.MEDIUM;
    
    switch (eventType) {
      case AuditEventType.USER_LOGIN:
        return AuditEventSeverity.LOW;
      case AuditEventType.PASSWORD_RESET_COMPLETED:
        return AuditEventSeverity.HIGH;
      case AuditEventType.MFA_VERIFIED:
        return AuditEventSeverity.LOW;
      default:
        return AuditEventSeverity.LOW;
    }
  }

  private getAuthEventDescription(eventType: AuditEventType, email?: string, success?: boolean): string {
    const action = success ? 'successful' : 'failed';
    switch (eventType) {
      case AuditEventType.USER_LOGIN:
        return `${success ? 'Successful' : 'Failed'} login for: ${email}`;
      case AuditEventType.USER_LOGOUT:
        return `User logged out: ${email}`;
      case AuditEventType.PASSWORD_RESET_COMPLETED:
        return `Password reset completed for: ${email}`;
      case AuditEventType.MFA_VERIFIED:
        return `MFA ${action} for: ${email}`;
      default:
        return `Auth event: ${eventType} for ${email}`;
    }
  }

  private getDataAccessEventType(action: string): AuditEventType {
    switch (action) {
      case 'create':
        return AuditEventType.DATA_CREATED;
      case 'read':
        return AuditEventType.DATA_ACCESSED;
      case 'update':
        return AuditEventType.DATA_MODIFIED;
      case 'delete':
        return AuditEventType.DATA_DELETED;
      default:
        return AuditEventType.DATA_ACCESSED;
    }
  }

  private getDataAccessSeverity(action: string, resourceType: string): AuditEventSeverity {
    if (this.isSensitiveResource(resourceType)) {
      return action === 'delete' ? AuditEventSeverity.HIGH : AuditEventSeverity.MEDIUM;
    }
    return action === 'delete' ? AuditEventSeverity.MEDIUM : AuditEventSeverity.LOW;
  }

  private isSensitiveResource(resourceType: string): boolean {
    const sensitiveResources = [
      'user',
      'payment',
      'billing',
      'subscription',
      'financial',
      'personal_data',
      'credentials',
      'api_key',
    ];
    return sensitiveResources.some(sensitive => 
      resourceType.toLowerCase().includes(sensitive)
    );
  }

  private mapSecurityEventToAuditEvent(securityEventType: SecurityEventType): AuditEventType | null {
    const mapping: Record<SecurityEventType, AuditEventType | null> = {
      [SecurityEventType.LOGIN_SUCCESS]: AuditEventType.USER_LOGIN,
      [SecurityEventType.LOGIN_FAILED]: AuditEventType.LOGIN_FAILED,
      [SecurityEventType.LOGOUT]: AuditEventType.USER_LOGOUT,
      [SecurityEventType.UNAUTHORIZED_ACCESS]: AuditEventType.UNAUTHORIZED_ACCESS,
      [SecurityEventType.PRIVILEGE_ESCALATION]: AuditEventType.PRIVILEGE_ESCALATION,
      [SecurityEventType.SUSPICIOUS_REQUEST]: AuditEventType.SUSPICIOUS_ACTIVITY,
      [SecurityEventType.ADMIN_ACTION]: AuditEventType.ADMIN_ACTION,
      [SecurityEventType.USER_ROLE_CHANGED]: AuditEventType.ROLE_ASSIGNED,
      // Map others to null to avoid duplication
      [SecurityEventType.RATE_LIMIT_EXCEEDED]: null,
      [SecurityEventType.SENSITIVE_DATA_ACCESS]: null,
      [SecurityEventType.MASS_DATA_EXPORT]: null,
    } as any;

    return mapping[securityEventType] || null;
  }

  private mapSeverityToAuditSeverity(severity: 'low' | 'medium' | 'high' | 'critical'): AuditEventSeverity {
    switch (severity) {
      case 'low':
        return AuditEventSeverity.LOW;
      case 'medium':
        return AuditEventSeverity.MEDIUM;
      case 'high':
        return AuditEventSeverity.HIGH;
      case 'critical':
        return AuditEventSeverity.CRITICAL;
      default:
        return AuditEventSeverity.LOW;
    }
  }

  private mapAuditSeverityToSecuritySeverity(severity: AuditEventSeverity): 'low' | 'medium' | 'high' | 'critical' {
    switch (severity) {
      case AuditEventSeverity.LOW:
        return 'low';
      case AuditEventSeverity.MEDIUM:
        return 'medium';
      case AuditEventSeverity.HIGH:
        return 'high';
      case AuditEventSeverity.CRITICAL:
        return 'critical';
      default:
        return 'low';
    }
  }
}
