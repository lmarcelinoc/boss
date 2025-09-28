import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Request } from 'express';
import { AuditLog, Prisma, AuditEventType, AuditEventStatus, AuditEventSeverity } from '@prisma/client';

// Re-export the enums for convenience
export { AuditEventType, AuditEventStatus, AuditEventSeverity };

export interface AuditLogData {
  eventType: AuditEventType;
  userId?: string | null;
  tenantId?: string | null;
  sessionId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  userEmail?: string | null;
  targetUserId?: string | null;
  targetUserEmail?: string | null;
  description?: string | null;
  metadata?: Record<string, any> | null;
  requestData?: Record<string, any> | null;
  responseData?: Record<string, any> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  source?: string | null;
  severity?: AuditEventSeverity;
  status?: AuditEventStatus;
}

@Injectable()
export class PrismaAuditService {
  private readonly logger = new Logger(PrismaAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new audit log entry
   */
  async logEvent(data: AuditLogData, req?: Request): Promise<AuditLog> {
    try {
      // Extract additional data from request if provided
      if (req) {
        data.ipAddress = data.ipAddress || req.ip || req.socket.remoteAddress;
        data.userAgent = data.userAgent || (req.headers['user-agent'] as string);
        data.source = data.source || 'api';
      }

      const auditLogData: Prisma.AuditLogCreateInput = {
        eventType: data.eventType,
        userId: data.userId || null,
        tenantId: data.tenantId || null,
        sessionId: data.sessionId || null,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
        userEmail: data.userEmail || null,
        targetUserId: data.targetUserId || null,
        targetUserEmail: data.targetUserEmail || null,
        description: data.description || null,
        metadata: data.metadata || {},
        requestData: data.requestData || {},
        responseData: data.responseData || {},
        errorCode: data.errorCode || null,
        errorMessage: data.errorMessage || null,
        source: data.source || 'api',
        severity: data.severity || AuditEventSeverity.LOW,
        status: data.status || AuditEventStatus.SUCCESS,
        isSuspicious: false,
        requiresReview: this.requiresReview(data.eventType, data.status),
      };

      const auditLog = await this.prisma.auditLog.create({
        data: auditLogData,
      });

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
   * Log user registration
   */
  async logUserRegistration(
    userId: string,
    email: string,
    tenantId?: string | null,
    req?: Request,
    metadata?: Record<string, any>
  ): Promise<AuditLog> {
    return this.logEvent({
      eventType: AuditEventType.USER_REGISTERED,
      userId,
      tenantId: tenantId || null,
      userEmail: email,
      description: `User registered: ${email}`,
      metadata: metadata || null,
      severity: AuditEventSeverity.MEDIUM,
      status: AuditEventStatus.SUCCESS,
    }, req);
  }

  /**
   * Log successful login
   */
  async logUserLogin(
    userId: string,
    email: string,
    tenantId?: string | null,
    req?: Request,
    metadata?: Record<string, any>
  ): Promise<AuditLog> {
    return this.logEvent({
      eventType: AuditEventType.USER_LOGIN,
      userId,
      tenantId: tenantId || null,
      userEmail: email,
      description: `User logged in: ${email}`,
      metadata: metadata || null,
      severity: AuditEventSeverity.LOW,
      status: AuditEventStatus.SUCCESS,
    }, req);
  }

  /**
   * Log failed login
   */
  async logLoginFailed(
    email: string,
    reason: string,
    req?: Request,
    metadata?: Record<string, any>
  ): Promise<AuditLog> {
    return this.logEvent({
      eventType: AuditEventType.LOGIN_FAILED,
      userEmail: email,
      description: `Login failed for: ${email}`,
      errorMessage: reason,
      metadata: { failedEmail: email, reason, ...(metadata || {}) },
      severity: AuditEventSeverity.MEDIUM,
      status: AuditEventStatus.FAILURE,
    }, req);
  }

  /**
   * Log user logout
   */
  async logUserLogout(
    userId: string,
    email: string,
    sessionId?: string | null,
    tenantId?: string | null,
    req?: Request
  ): Promise<AuditLog> {
    return this.logEvent({
      eventType: AuditEventType.USER_LOGOUT,
      userId,
      tenantId: tenantId || null,
      sessionId: sessionId || null,
      userEmail: email,
      description: `User logged out: ${email}`,
      severity: AuditEventSeverity.LOW,
      status: AuditEventStatus.SUCCESS,
    }, req);
  }

  /**
   * Get audit logs with filtering
   */
  async getAuditLogs(filters: {
    userId?: string;
    tenantId?: string;
    eventType?: AuditEventType;
    status?: AuditEventStatus;
    severity?: AuditEventSeverity;
    startDate?: Date;
    endDate?: Date;
    isSuspicious?: boolean;
    requiresReview?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditLog[]; total: number }> {
    const where: Prisma.AuditLogWhereInput = {};

    if (filters.userId) where.userId = filters.userId;
    if (filters.tenantId) where.tenantId = filters.tenantId;
    if (filters.eventType) where.eventType = filters.eventType;
    if (filters.status) where.status = filters.status;
    if (filters.severity) where.severity = filters.severity;
    if (filters.isSuspicious !== undefined) where.isSuspicious = filters.isSuspicious;
    if (filters.requiresReview !== undefined) where.requiresReview = filters.requiresReview;

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: filters.offset || 0,
        take: Math.min(filters.limit || 50, 100),
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { logs, total };
  }

  /**
   * Get audit statistics
   */
  async getAuditStatistics(
    tenantId?: string,
    days: number = 30
  ): Promise<{
    totalEvents: number;
    suspiciousEvents: number;
    failedEvents: number;
    eventsByType: Record<string, number>;
    eventsByStatus: Record<string, number>;
    eventsBySeverity: Record<string, number>;
  }> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const where: Prisma.AuditLogWhereInput = {
      createdAt: { gte: startDate },
    };

    if (tenantId) where.tenantId = tenantId;

    const logs = await this.prisma.auditLog.findMany({ where });

    const stats = {
      totalEvents: logs.length,
      suspiciousEvents: 0,
      failedEvents: 0,
      eventsByType: {} as Record<string, number>,
      eventsByStatus: {} as Record<string, number>,
      eventsBySeverity: {} as Record<string, number>,
    };

    logs.forEach(log => {
      // Count by type
      stats.eventsByType[log.eventType] = (stats.eventsByType[log.eventType] || 0) + 1;

      // Count by status
      stats.eventsByStatus[log.status] = (stats.eventsByStatus[log.status] || 0) + 1;

      // Count by severity
      stats.eventsBySeverity[log.severity] = (stats.eventsBySeverity[log.severity] || 0) + 1;

      // Count suspicious events
      if (log.isSuspicious) stats.suspiciousEvents++;

      // Count failed events
      if (log.status === AuditEventStatus.FAILURE) stats.failedEvents++;
    });

    return stats;
  }

  /**
   * Clean up old audit logs
   */
  async cleanupOldLogs(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const result = await this.prisma.auditLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });

    this.logger.log(
      `Cleaned up ${result.count} old audit logs older than ${retentionDays} days`
    );

    return result.count;
  }

  /**
   * Determine if an event requires review
   */
  private requiresReview(eventType: AuditEventType, status?: AuditEventStatus): boolean {
    const reviewRequiredEvents = [
      AuditEventType.LOGIN_FAILED,
      AuditEventType.MFA_FAILED,
      AuditEventType.SUSPICIOUS_ACTIVITY,
      AuditEventType.SECURITY_VIOLATION,
      AuditEventType.USER_IMPERSONATION_START,
      AuditEventType.ACCOUNT_LOCKED,
    ];

    return reviewRequiredEvents.includes(eventType) || status === AuditEventStatus.FAILURE;
  }
}
