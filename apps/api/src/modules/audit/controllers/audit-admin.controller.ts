import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../../../common/decorators/permissions.decorator';
import { PermissionAction, PermissionResource } from '../../rbac/entities/permission.entity';
import { EnhancedAuditService, EnhancedAuditLogData } from '../services/enhanced-audit.service';
import { AuditEventType, AuditEventStatus, AuditEventSeverity } from '../entities/audit-log.entity';
import { SkipRateLimit } from '../../rate-limiting/decorators/rate-limit.decorator';
import { TenantScoped } from '../../tenants/decorators/tenant-scoped.decorator';

interface AuditLogQueryDto {
  userId?: string;
  tenantId?: string;
  eventType?: AuditEventType;
  status?: AuditEventStatus;
  severity?: AuditEventSeverity;
  startDate?: string; // ISO date string
  endDate?: string; // ISO date string
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userEmail?: string;
  limit?: number;
  offset?: number;
}

interface ManualAuditLogDto {
  eventType: AuditEventType;
  userId?: string;
  targetUserId?: string;
  description: string;
  metadata?: Record<string, any>;
  severity?: AuditEventSeverity;
  status?: AuditEventStatus;
  resourceType?: string;
  resourceId?: string;
}

/**
 * Audit Administration Controller
 * Comprehensive audit log management and reporting
 */
@ApiTags('audit')
@ApiBearerAuth()
@Controller('admin/audit')
@UseGuards(JwtAuthGuard)
@SkipRateLimit() // Admin endpoints should not be rate limited
@TenantScoped()
export class AuditAdminController {
  constructor(private readonly auditService: EnhancedAuditService) {}

  /**
   * Get audit logs with comprehensive filtering
   */
  @Get('logs')
  @ApiOperation({ summary: 'Get audit logs with filtering' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'eventType', required: false, enum: AuditEventType })
  @ApiQuery({ name: 'status', required: false, enum: AuditEventStatus })
  @ApiQuery({ name: 'severity', required: false, enum: AuditEventSeverity })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'resourceType', required: false })
  @ApiQuery({ name: 'resourceId', required: false })
  @ApiQuery({ name: 'ipAddress', required: false })
  @ApiQuery({ name: 'userEmail', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Audit logs retrieved successfully',
  })
  @RequirePermission(PermissionResource.AUDIT, PermissionAction.READ)
  async getAuditLogs(@Query() query: AuditLogQueryDto) {
    const filters: any = {
      limit: query.limit ? Math.min(query.limit, 100) : 50,
      offset: query.offset || 0,
    };

    if (query.startDate) {
      filters.startDate = new Date(query.startDate);
    }
    if (query.endDate) {
      filters.endDate = new Date(query.endDate);
    }
    if (query.userId) {
      filters.userId = query.userId;
    }
    if (query.tenantId) {
      filters.tenantId = query.tenantId;
    }
    if (query.eventType) {
      filters.eventType = query.eventType;
    }
    if (query.status) {
      filters.status = query.status;
    }
    if (query.severity) {
      filters.severity = query.severity;
    }
    if (query.userEmail) {
      filters.userEmail = query.userEmail;
    }

    return this.auditService.getAuditLogs(filters);
  }

  /**
   * Get audit statistics and metrics
   */
  @Get('statistics')
  @ApiOperation({ summary: 'Get audit statistics and metrics' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Audit statistics retrieved successfully',
  })
  @RequirePermission(PermissionResource.AUDIT, PermissionAction.READ)
  async getAuditStatistics(
    @Query('tenantId') tenantId?: string,
    @Query('days') days?: number,
  ) {
    return this.auditService.getAuditStatistics(tenantId, days || 30);
  }

  /**
   * Get authentication-related audit events
   */
  @Get('events/auth')
  @ApiOperation({ summary: 'Get authentication-related audit events' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'userEmail', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'status', required: false, enum: AuditEventStatus })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Authentication audit events retrieved successfully',
  })
  @RequirePermission(PermissionResource.AUDIT, PermissionAction.READ)
  async getAuthAuditEvents(@Query() query: any) {
    const authEventTypes = [
      AuditEventType.USER_LOGIN,
      AuditEventType.LOGIN_FAILED,
      AuditEventType.USER_LOGOUT,
      AuditEventType.PASSWORD_RESET_REQUESTED,
      AuditEventType.PASSWORD_RESET_COMPLETED,
      AuditEventType.MFA_VERIFIED,
      AuditEventType.MFA_FAILED,
    ];

    const results = await Promise.all(
      authEventTypes.map(eventType => {
        const filters: any = {
          eventType,
          limit: 10, // Limit per event type
          offset: 0,
        };

        if (query.userId) {
          filters.userId = query.userId;
        }
        if (query.userEmail) {
          filters.userEmail = query.userEmail;
        }
        if (query.startDate) {
          filters.startDate = new Date(query.startDate);
        }
        if (query.endDate) {
          filters.endDate = new Date(query.endDate);
        }
        if (query.status) {
          filters.status = query.status;
        }

        return this.auditService.getAuditLogs(filters);
      })
    );

    // Combine and sort results
    const allLogs = results.flatMap(result => result.logs);
    allLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totalCount = results.reduce((sum, result) => sum + result.total, 0);
    const limit = Math.min(query.limit || 50, 100);
    const offset = query.offset || 0;

    return {
      logs: allLogs.slice(offset, offset + limit),
      total: totalCount,
      eventTypeCounts: authEventTypes.reduce((acc, eventType, index) => {
        acc[eventType] = results[index]?.total || 0;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  /**
   * Get role and permission change audit events
   */
  @Get('events/rbac')
  @ApiOperation({ summary: 'Get role and permission change audit events' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'targetUserId', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'RBAC audit events retrieved successfully',
  })
  @RequirePermission(PermissionResource.AUDIT, PermissionAction.READ)
  async getRBACAuditEvents(@Query() query: any) {
    const rbacEventTypes = [
      AuditEventType.ROLE_ASSIGNED,
      AuditEventType.ROLE_REVOKED,
      AuditEventType.PERMISSION_GRANTED,
      AuditEventType.PERMISSION_REVOKED,
      AuditEventType.PRIVILEGE_ESCALATION,
    ];

    const results = await Promise.all(
      rbacEventTypes.map(eventType => {
        const filters: any = {
          eventType,
          limit: 10, // Limit per event type
          offset: 0,
        };

        if (query.userId) {
          filters.userId = query.userId;
        }
        if (query.targetUserId) {
          filters.targetUserId = query.targetUserId;
        }
        if (query.startDate) {
          filters.startDate = new Date(query.startDate);
        }
        if (query.endDate) {
          filters.endDate = new Date(query.endDate);
        }

        return this.auditService.getAuditLogs(filters);
      })
    );

    // Combine and sort results
    const allLogs = results.flatMap(result => result.logs);
    allLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totalCount = results.reduce((sum, result) => sum + result.total, 0);
    const limit = Math.min(query.limit || 50, 100);
    const offset = query.offset || 0;

    return {
      logs: allLogs.slice(offset, offset + limit),
      total: totalCount,
      eventTypeCounts: rbacEventTypes.reduce((acc, eventType, index) => {
        acc[eventType] = results[index]?.total || 0;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  /**
   * Get data access audit events
   */
  @Get('events/data-access')
  @ApiOperation({ summary: 'Get data access audit events' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'resourceType', required: false })
  @ApiQuery({ name: 'resourceId', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Data access audit events retrieved successfully',
  })
  @RequirePermission(PermissionResource.AUDIT, PermissionAction.READ)
  async getDataAccessAuditEvents(@Query() query: any) {
    const dataAccessEventTypes = [
      AuditEventType.DATA_CREATED,
      AuditEventType.DATA_ACCESSED,
      AuditEventType.DATA_MODIFIED,
      AuditEventType.DATA_DELETED,
      AuditEventType.BULK_OPERATION,
    ];

    const results = await Promise.all(
      dataAccessEventTypes.map(eventType => {
        const filters: any = {
          eventType,
          limit: 10, // Limit per event type
          offset: 0,
        };

        if (query.userId) {
          filters.userId = query.userId;
        }
        if (query.resourceType) {
          filters.resourceType = query.resourceType;
        }
        if (query.resourceId) {
          filters.resourceId = query.resourceId;
        }
        if (query.startDate) {
          filters.startDate = new Date(query.startDate);
        }
        if (query.endDate) {
          filters.endDate = new Date(query.endDate);
        }

        return this.auditService.getAuditLogs(filters);
      })
    );

    // Combine and sort results
    const allLogs = results.flatMap(result => result.logs);
    allLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totalCount = results.reduce((sum, result) => sum + result.total, 0);
    const limit = Math.min(query.limit || 50, 100);
    const offset = query.offset || 0;

    return {
      logs: allLogs.slice(offset, offset + limit),
      total: totalCount,
      eventTypeCounts: dataAccessEventTypes.reduce((acc, eventType, index) => {
        acc[eventType] = results[index]?.total || 0;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  /**
   * Get suspicious activity audit events
   */
  @Get('events/suspicious')
  @ApiOperation({ summary: 'Get suspicious activity audit events' })
  @ApiQuery({ name: 'severity', required: false, enum: AuditEventSeverity })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Suspicious activity audit events retrieved successfully',
  })
  @RequirePermission(PermissionResource.AUDIT, PermissionAction.READ)
  async getSuspiciousAuditEvents(@Query() query: any) {
    const suspiciousEventTypes = [
      AuditEventType.SUSPICIOUS_ACTIVITY,
      AuditEventType.UNAUTHORIZED_ACCESS,
      AuditEventType.LOGIN_FAILED,
      AuditEventType.MFA_FAILED,
      AuditEventType.PRIVILEGE_ESCALATION,
    ];

    // Get events with high severity or failed status
    const filters: any = {
      severity: query.severity || AuditEventSeverity.HIGH,
      limit: query.limit || 50,
      offset: query.offset || 0,
    };

    if (query.startDate) {
      filters.startDate = new Date(query.startDate);
    }
    if (query.endDate) {
      filters.endDate = new Date(query.endDate);
    }

    const results = await Promise.all([
      // Get high-severity events
      this.auditService.getAuditLogs({
        ...filters,
        severity: AuditEventSeverity.HIGH,
      }),
      // Get critical events
      this.auditService.getAuditLogs({
        ...filters,
        severity: AuditEventSeverity.CRITICAL,
      }),
      // Get failed events
      this.auditService.getAuditLogs({
        ...filters,
        status: AuditEventStatus.FAILURE,
      }),
    ]);

    // Combine and deduplicate results
    const allLogs = results.flatMap(result => result.logs);
    const uniqueLogs = allLogs.filter((log, index, arr) => 
      arr.findIndex(l => l.id === log.id) === index
    );
    
    uniqueLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      logs: uniqueLogs.slice(0, query.limit || 50),
      total: uniqueLogs.length,
      severityCounts: {
        [AuditEventSeverity.HIGH]: results[0].total,
        [AuditEventSeverity.CRITICAL]: results[1].total,
      },
      failedEventCount: results[2].total,
    };
  }

  /**
   * Create a manual audit log entry (for testing or administrative purposes)
   */
  @Post('logs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a manual audit log entry' })
  @ApiResponse({
    status: 201,
    description: 'Audit log entry created successfully',
  })
  @RequirePermission(PermissionResource.AUDIT, PermissionAction.CREATE)
  async createAuditLog(
    @Body() auditLogDto: ManualAuditLogDto,
    @Request() req: any,
  ) {
    const auditData: any = {
      eventType: auditLogDto.eventType,
      userId: auditLogDto.userId || req.user?.id,
      tenantId: req.tenantId,
      userEmail: req.user?.email,
      description: auditLogDto.description,
      metadata: {
        ...auditLogDto.metadata,
        manualEntry: true,
        createdBy: req.user?.email,
      },
      severity: auditLogDto.severity || AuditEventSeverity.MEDIUM,
      status: auditLogDto.status || AuditEventStatus.SUCCESS,
      resourceType: auditLogDto.resourceType,
      resourceId: auditLogDto.resourceId,
      source: 'manual',
    };

    if (auditLogDto.targetUserId) {
      auditData.targetUserId = auditLogDto.targetUserId;
    }

    const auditLog = await this.auditService.logEvent(auditData, req);

    return {
      message: 'Audit log entry created successfully',
      auditLog,
    };
  }

  /**
   * Export audit report
   */
  @Get('export')
  @ApiOperation({ summary: 'Export audit report' })
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'csv'] })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'eventTypes', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiResponse({
    status: 200,
    description: 'Audit report exported successfully',
  })
  @RequirePermission(PermissionResource.AUDIT, PermissionAction.READ)
  async exportAuditReport(@Query() query: any) {
    const filters = {
      userId: query.userId,
      tenantId: query.tenantId,
      startDate: query.startDate ? new Date(query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: query.endDate ? new Date(query.endDate) : new Date(),
      limit: 10000, // Large limit for export
    };

    const { logs, total } = await this.auditService.getAuditLogs(filters);
    const statistics = await this.auditService.getAuditStatistics(filters.tenantId, 30);

    const report = {
      generatedAt: new Date(),
      period: {
        startDate: filters.startDate,
        endDate: filters.endDate,
      },
      summary: {
        exportedEvents: logs.length,
        ...statistics,
        totalEvents: total,
      },
      events: logs,
      metadata: {
        exportFormat: query.format || 'json',
        filters: query,
      },
    };

    return report;
  }

  /**
   * Clean up old audit logs (Admin only)
   */
  @Delete('cleanup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clean up old audit logs' })
  @ApiQuery({ name: 'retentionDays', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Audit logs cleaned up successfully',
  })
  @RequirePermission(PermissionResource.AUDIT, PermissionAction.DELETE)
  async cleanupOldAuditLogs(@Query('retentionDays') retentionDays?: number) {
    const days = retentionDays || 90;
    const deletedCount = await this.auditService.cleanupOldAuditLogs(days);

    return {
      message: `Cleaned up ${deletedCount} audit logs older than ${days} days`,
      deletedCount,
      retentionDays: days,
    };
  }

  /**
   * Get audit trail for a specific user
   */
  @Get('users/:userId/trail')
  @ApiOperation({ summary: 'Get audit trail for a specific user' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'User audit trail retrieved successfully',
  })
  @RequirePermission(PermissionResource.AUDIT, PermissionAction.READ)
  async getUserAuditTrail(
    @Param('userId') userId: string,
    @Query() query: any,
  ) {
    const filters: any = {
      userId,
      limit: Math.min(query.limit || 100, 500),
      offset: query.offset || 0,
    };

    if (query.startDate) {
      filters.startDate = new Date(query.startDate);
    }
    if (query.endDate) {
      filters.endDate = new Date(query.endDate);
    }

    const { logs, total } = await this.auditService.getAuditLogs(filters);

    // Also get logs where this user was the target
    const { logs: targetLogs } = await this.auditService.getAuditLogs({
      ...filters,
      userId: undefined,
      targetUserId: userId,
    });

    // Combine and sort
    const allLogs = [...logs, ...targetLogs];
    const uniqueLogs = allLogs.filter((log, index, arr) => 
      arr.findIndex(l => l.id === log.id) === index
    );
    
    uniqueLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      userId,
      logs: uniqueLogs.slice(0, filters.limit),
      total: uniqueLogs.length,
      asActor: logs.length,
      asTarget: targetLogs.length,
    };
  }

  /**
   * Get audit trail for a specific resource
   */
  @Get('resources/:resourceType/:resourceId/trail')
  @ApiOperation({ summary: 'Get audit trail for a specific resource' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Resource audit trail retrieved successfully',
  })
  @RequirePermission(PermissionResource.AUDIT, PermissionAction.READ)
  async getResourceAuditTrail(
    @Param('resourceType') resourceType: string,
    @Param('resourceId') resourceId: string,
    @Query() query: any,
  ) {
    const filters: any = {
      resourceType,
      resourceId,
      limit: Math.min(query.limit || 100, 500),
      offset: query.offset || 0,
    };

    if (query.startDate) {
      filters.startDate = new Date(query.startDate);
    }
    if (query.endDate) {
      filters.endDate = new Date(query.endDate);
    }

    const { logs, total } = await this.auditService.getAuditLogs(filters);

    return {
      resourceType,
      resourceId,
      logs,
      total,
      activitySummary: logs.reduce((acc, log) => {
        acc[log.eventType] = (acc[log.eventType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
  }
}
