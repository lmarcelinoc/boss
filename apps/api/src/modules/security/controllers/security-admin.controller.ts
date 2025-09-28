import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { PermissionAction, PermissionResource } from '../../rbac/entities/permission.entity';
import { SecurityAuditService, SecurityAuditResult } from '../services/security-audit.service';
import { 
  SecurityMonitoringService, 
  SecurityEvent, 
  SecurityEventType, 
  SecurityMetrics,
  SecurityThreat
} from '../services/security-monitoring.service';
import { SkipRateLimit } from '../../rate-limiting/decorators/rate-limit.decorator';
import { TenantScoped } from '../../tenants/decorators/tenant-scoped.decorator';

interface BlockIPDto {
  ipAddress: string;
  reason: string;
  duration?: number; // Duration in milliseconds, undefined for permanent
}

interface SecurityEventDto {
  type: SecurityEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: Record<string, any>;
  blocked?: boolean;
}

/**
 * Security Administration Controller
 * Provides security auditing, monitoring, and management endpoints
 */
@ApiTags('security')
@ApiBearerAuth()
@Controller('admin/security')
@UseGuards(JwtAuthGuard)
@SkipRateLimit() // Security admin endpoints should not be rate limited
@TenantScoped()
export class SecurityAdminController {
  constructor(
    private readonly securityAuditService: SecurityAuditService,
    private readonly securityMonitoringService: SecurityMonitoringService,
  ) {}

  /**
   * Perform comprehensive security audit
   */
  @Get('audit')
  @ApiOperation({ summary: 'Perform comprehensive security audit' })
  @ApiResponse({
    status: 200,
    description: 'Security audit completed successfully',
  })
  @RequirePermissions(PermissionAction.READ, PermissionResource.SYSTEM)
  async performSecurityAudit(@Request() req: any): Promise<SecurityAuditResult> {
    return this.securityAuditService.performSecurityAudit(req);
  }

  /**
   * Get security metrics and statistics
   */
  @Get('metrics')
  @ApiOperation({ summary: 'Get security monitoring metrics' })
  @ApiResponse({
    status: 200,
    description: 'Security metrics retrieved successfully',
  })
  @RequirePermissions(PermissionAction.READ, PermissionResource.SYSTEM)
  async getSecurityMetrics(): Promise<SecurityMetrics> {
    return this.securityMonitoringService.getSecurityMetrics();
  }

  /**
   * Get security events by type
   */
  @Get('events/:type')
  @ApiOperation({ summary: 'Get security events by type' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Security events retrieved successfully',
  })
  @RequirePermissions(PermissionAction.READ, PermissionResource.SYSTEM)
  async getEventsByType(
    @Param('type') type: SecurityEventType,
    @Query('limit') limit?: number,
  ): Promise<SecurityEvent[]> {
    return this.securityMonitoringService.getEventsByType(type, limit || 100);
  }

  /**
   * Get security events by IP address
   */
  @Get('events/ip/:ipAddress')
  @ApiOperation({ summary: 'Get security events by IP address' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Security events retrieved successfully',
  })
  @RequirePermissions(PermissionAction.READ, PermissionResource.SYSTEM)
  async getEventsByIP(
    @Param('ipAddress') ipAddress: string,
    @Query('limit') limit?: number,
  ): Promise<SecurityEvent[]> {
    return this.securityMonitoringService.getEventsByIP(ipAddress, limit || 100);
  }

  /**
   * Get critical security events
   */
  @Get('events/critical')
  @ApiOperation({ summary: 'Get recent critical security events' })
  @ApiQuery({ name: 'hoursBack', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Critical security events retrieved successfully',
  })
  @RequirePermissions(PermissionAction.READ, PermissionResource.SYSTEM)
  async getCriticalEvents(@Query('hoursBack') hoursBack?: number): Promise<SecurityEvent[]> {
    return this.securityMonitoringService.getCriticalEvents(hoursBack || 24);
  }

  /**
   * Analyze suspicious patterns
   */
  @Get('analysis/suspicious-patterns')
  @ApiOperation({ summary: 'Analyze suspicious activity patterns' })
  @ApiResponse({
    status: 200,
    description: 'Suspicious patterns analysis completed',
  })
  @RequirePermissions(PermissionAction.READ, PermissionResource.SYSTEM)
  async analyzeSuspiciousPatterns(): Promise<{
    bruteForceAttempts: { ip: string; count: number }[];
    rapidRequests: { ip: string; requestsPerMinute: number }[];
    suspiciousUserAgents: string[];
    frequentFailures: { userId: string; failures: number }[];
  }> {
    return this.securityMonitoringService.analyzeSuspiciousPatterns();
  }

  /**
   * Get list of blocked IP addresses
   */
  @Get('blocked-ips')
  @ApiOperation({ summary: 'Get list of blocked IP addresses' })
  @ApiResponse({
    status: 200,
    description: 'Blocked IPs retrieved successfully',
  })
  @RequirePermissions(PermissionAction.READ, PermissionResource.SYSTEM)
  async getBlockedIPs(): Promise<string[]> {
    return this.securityMonitoringService.getBlockedIPs();
  }

  /**
   * Block an IP address
   */
  @Post('block-ip')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block an IP address' })
  @ApiResponse({
    status: 200,
    description: 'IP address blocked successfully',
  })
  @RequirePermissions(PermissionAction.CREATE, PermissionResource.SYSTEM)
  async blockIP(@Body() blockIPDto: BlockIPDto): Promise<{ message: string }> {
    await this.securityMonitoringService.blockIP(
      blockIPDto.ipAddress,
      blockIPDto.reason,
      blockIPDto.duration,
    );
    
    return { 
      message: `IP address ${blockIPDto.ipAddress} has been blocked`,
    };
  }

  /**
   * Unblock an IP address
   */
  @Delete('blocked-ips/:ipAddress')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unblock an IP address' })
  @ApiResponse({
    status: 200,
    description: 'IP address unblocked successfully',
  })
  @RequirePermissions(PermissionAction.DELETE, PermissionResource.SYSTEM)
  async unblockIP(@Param('ipAddress') ipAddress: string): Promise<{ message: string }> {
    await this.securityMonitoringService.unblockIP(ipAddress);
    
    return { 
      message: `IP address ${ipAddress} has been unblocked`,
    };
  }

  /**
   * Log a custom security event (for testing or manual logging)
   */
  @Post('events')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Log a custom security event' })
  @ApiResponse({
    status: 201,
    description: 'Security event logged successfully',
  })
  @RequirePermissions(PermissionAction.CREATE, PermissionResource.SYSTEM)
  async logSecurityEvent(
    @Body() eventDto: SecurityEventDto,
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.securityMonitoringService.logSecurityEvent(
      eventDto.type,
      eventDto.severity,
      eventDto.details,
      req,
      eventDto.blocked || false,
    );
    
    return { 
      message: 'Security event logged successfully',
    };
  }

  /**
   * Clear all security events (use with caution)
   */
  @Delete('events')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear all security events' })
  @ApiResponse({
    status: 204,
    description: 'Security events cleared successfully',
  })
  @RequirePermissions(PermissionAction.DELETE, PermissionResource.SYSTEM)
  async clearSecurityEvents(): Promise<void> {
    this.securityMonitoringService.clearEvents();
  }

  /**
   * Check if an IP is blocked or suspicious
   */
  @Get('check-ip/:ipAddress')
  @ApiOperation({ summary: 'Check IP address status' })
  @ApiResponse({
    status: 200,
    description: 'IP status retrieved successfully',
  })
  @RequirePermissions(PermissionAction.READ, PermissionResource.SYSTEM)
  async checkIPStatus(@Param('ipAddress') ipAddress: string): Promise<{
    ipAddress: string;
    blocked: boolean;
    suspicious: boolean;
    events: SecurityEvent[];
  }> {
    const blocked = this.securityMonitoringService.isIPBlocked(ipAddress);
    const suspicious = this.securityMonitoringService.isIPSuspicious(ipAddress);
    const events = this.securityMonitoringService.getEventsByIP(ipAddress, 10);

    return {
      ipAddress,
      blocked,
      suspicious,
      events,
    };
  }

  /**
   * Test security monitoring (creates test events)
   */
  @Post('test/monitoring')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test security monitoring with sample events' })
  @ApiResponse({
    status: 200,
    description: 'Test events created successfully',
  })
  @RequirePermissions(PermissionAction.CREATE, PermissionResource.SYSTEM)
  async testSecurityMonitoring(@Request() req: any): Promise<{ message: string; eventsCreated: number }> {
    const testEvents = [
      {
        type: SecurityEventType.LOGIN_FAILED,
        severity: 'medium' as const,
        details: { reason: 'Invalid password', loginAttempt: 1 },
      },
      {
        type: SecurityEventType.RATE_LIMIT_EXCEEDED,
        severity: 'low' as const,
        details: { endpoint: '/api/test', limit: 100 },
      },
      {
        type: SecurityEventType.SUSPICIOUS_REQUEST,
        severity: 'high' as const,
        details: { reason: 'Unusual request pattern', requestCount: 150 },
      },
    ];

    for (const event of testEvents) {
      await this.securityMonitoringService.logSecurityEvent(
        event.type,
        event.severity,
        event.details,
        req,
      );
    }

    return {
      message: 'Test security events created successfully',
      eventsCreated: testEvents.length,
    };
  }

  /**
   * Export security report (last 24 hours)
   */
  @Get('report/export')
  @ApiOperation({ summary: 'Export security report' })
  @ApiResponse({
    status: 200,
    description: 'Security report exported successfully',
  })
  @RequirePermissions(PermissionAction.READ, PermissionResource.SYSTEM)
  async exportSecurityReport(): Promise<{
    generatedAt: Date;
    period: string;
    summary: SecurityMetrics;
    criticalEvents: SecurityEvent[];
    suspiciousPatterns: any;
    auditResults: SecurityAuditResult;
  }> {
    const [metrics, criticalEvents, suspiciousPatterns, auditResults] = await Promise.all([
      Promise.resolve(this.securityMonitoringService.getSecurityMetrics()),
      Promise.resolve(this.securityMonitoringService.getCriticalEvents(24)),
      Promise.resolve(this.securityMonitoringService.analyzeSuspiciousPatterns()),
      this.securityAuditService.performSecurityAudit(),
    ]);

    return {
      generatedAt: new Date(),
      period: 'Last 24 hours',
      summary: metrics,
      criticalEvents,
      suspiciousPatterns,
      auditResults,
    };
  }
}
