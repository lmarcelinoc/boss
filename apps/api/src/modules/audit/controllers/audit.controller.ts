import {
  Controller,
  Get,
  Query,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaAuditService, AuditEventType, AuditEventStatus, AuditEventSeverity } from '../services/prisma-audit.service';
import { PermissionResource, PermissionAction } from '../../rbac/entities/permission.entity';
import { RequirePermission } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/auth.decorator';

export class GetAuditLogsDto {
  @ApiQuery({ required: false, description: 'Filter by user ID' })
  userId?: string;

  // tenantId removed - using simplified audit without tenant isolation

  @ApiQuery({ required: false, enum: AuditEventType, description: 'Filter by event type' })
  eventType?: AuditEventType;

  @ApiQuery({ required: false, enum: AuditEventStatus, description: 'Filter by event status' })
  status?: AuditEventStatus;

  @ApiQuery({ required: false, enum: AuditEventSeverity, description: 'Filter by event severity' })
  severity?: AuditEventSeverity;

  @ApiQuery({ required: false, description: 'Filter by start date (ISO string)' })
  startDate?: string;

  @ApiQuery({ required: false, description: 'Filter by end date (ISO string)' })
  endDate?: string;

  @ApiQuery({ required: false, type: Boolean, description: 'Filter suspicious events only' })
  isSuspicious?: boolean;

  @ApiQuery({ required: false, type: Boolean, description: 'Filter events requiring review' })
  requiresReview?: boolean;

  @ApiQuery({ required: false, type: Number, default: 50, description: 'Number of records to return' })
  limit?: number;

  @ApiQuery({ required: false, type: Number, default: 0, description: 'Number of records to skip' })
  offset?: number;
}

export class CleanupLogsDto {
  retentionDays: number;
}

@ApiTags('Audit')
@ApiBearerAuth('JWT-auth')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: PrismaAuditService) {}

  @Get('logs')
  @RequirePermission(PermissionResource.SYSTEM_SETTINGS, PermissionAction.READ)
  @ApiOperation({ summary: 'Get audit logs with filtering' })
  @ApiResponse({
    status: 200,
    description: 'Audit logs retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        logs: {
          type: 'array',
          items: { type: 'object' },
        },
        total: { type: 'number' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
  })
  async getAuditLogs(
    @Query() query: GetAuditLogsDto,
    @CurrentUser() user: any,
  ) {
    const filters = {
      ...query,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      limit: Math.min(query.limit || 50, 100),
      offset: query.offset || 0,
    };

    // Simplified audit without tenant isolation

    const result = await this.auditService.getAuditLogs(filters);

    return {
      ...result,
      limit: filters.limit,
      offset: filters.offset,
    };
  }

  @Get('logs/suspicious')
  @RequirePermission(PermissionResource.AUDIT, PermissionAction.READ)
  @ApiOperation({ summary: 'Get suspicious audit events' })
  @ApiResponse({
    status: 200,
    description: 'Suspicious events retrieved successfully',
  })
  async getSuspiciousEvents(
    @Query('limit') limit: number = 20,
    @Query('offset') offset: number = 0,
    @CurrentUser() currentUser: any,
  ) {
    return this.auditService.getAuditLogs({
      isSuspicious: true,
      limit: Math.min(limit, 100),
      offset,
    });
  }

  @Get('logs/pending-review')
  @RequirePermission(PermissionResource.AUDIT, PermissionAction.READ)
  @ApiOperation({ summary: 'Get audit events requiring review' })
  @ApiResponse({
    status: 200,
    description: 'Events requiring review retrieved successfully',
  })
  async getEventsRequiringReview(
    @Query('limit') limit: number = 20,
    @Query('offset') offset: number = 0,
    @CurrentUser() currentUser: any,
  ) {
    return this.auditService.getAuditLogs({
      requiresReview: true,
      limit: Math.min(limit, 100),
      offset,
    });
  }

  @Get('logs/failed')
  @RequirePermission(PermissionResource.AUDIT, PermissionAction.READ)
  @ApiOperation({ summary: 'Get failed audit events' })
  @ApiResponse({
    status: 200,
    description: 'Failed events retrieved successfully',
  })
  async getFailedEvents(
    @Query('limit') limit: number = 20,
    @Query('offset') offset: number = 0,
    @CurrentUser() currentUser: any,
  ) {
    return this.auditService.getAuditLogs({
      status: AuditEventStatus.FAILURE,
      limit: Math.min(limit, 100),
      offset,
    });
  }

  @Get('stats')
  @RequirePermission(PermissionResource.AUDIT, PermissionAction.READ)
  @ApiOperation({ summary: 'Get audit statistics' })
  @ApiResponse({
    status: 200,
    description: 'Audit statistics retrieved successfully',
  })
  async getAuditStatistics(
    @Query('days') days: number = 30,
    @CurrentUser() currentUser: any,
  ) {
    return this.auditService.getAuditStatistics(undefined, days);
  }

  @Get('user/:userId')
  @RequirePermission(PermissionResource.USERS, PermissionAction.READ)
  @ApiOperation({ summary: 'Get audit logs for a specific user' })
  @ApiResponse({
    status: 200,
    description: 'User audit logs retrieved successfully',
  })
  async getUserAuditLogs(
    @Query('userId') userId: string,
    @Query('limit') limit: number = 50,
    @Query('offset') offset: number = 0,
    @CurrentUser() currentUser: any,
    @CurrentUser() currentUser: any,
  ) {
    // Users can only view their own logs unless they're admin
    if (currentUser.role !== 'ADMIN' && currentUser.role !== 'OWNER' && currentUser.id !== userId) {
      userId = currentUser.id;
    }

    return this.auditService.getAuditLogs({
      userId,
      limit: Math.min(limit, 100),
      offset,
    });
  }

  @Post('cleanup')
  @RequirePermission(PermissionResource.AUDIT, PermissionAction.DELETE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cleanup old audit logs' })
  @ApiResponse({
    status: 200,
    description: 'Old logs cleaned up successfully',
    schema: {
      type: 'object',
      properties: {
        deletedCount: { type: 'number' },
        retentionDays: { type: 'number' },
      },
    },
  })
  async cleanupOldLogs(@Body() body: CleanupLogsDto) {
    const deletedCount = await this.auditService.cleanupOldLogs(body.retentionDays);
    
    return {
      deletedCount,
      retentionDays: body.retentionDays,
      message: `Cleaned up ${deletedCount} old audit logs`,
    };
  }

  @Get('events/types')
  @RequirePermission(PermissionResource.AUDIT, PermissionAction.READ)
  @ApiOperation({ summary: 'Get available audit event types' })
  @ApiResponse({
    status: 200,
    description: 'Event types retrieved successfully',
  })
  async getEventTypes() {
    return {
      eventTypes: Object.values(AuditEventType),
      statuses: Object.values(AuditEventStatus),
      severities: Object.values(AuditEventSeverity),
    };
  }
}
