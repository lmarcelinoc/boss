import {
  Controller,
  Get,
  Delete,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RateLimitingService } from '../services/rate-limiting.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { PermissionAction, PermissionResource } from '../../rbac/entities/permission.entity';
import { SkipRateLimit } from '../decorators/rate-limit.decorator';
import { TenantScoped } from '../../tenants/decorators/tenant-scoped.decorator';

interface RateLimitStatusDto {
  key: string;
  currentRequests: number;
  maxRequests: number;
  remainingRequests: number;
  resetTime: Date;
  blocked: boolean;
}

interface RateLimitStatsDto {
  totalKeys: number;
  activeKeys: number;
  blockedKeys: number;
  topBlockedIps?: string[];
  topUsers?: string[];
}

/**
 * Rate Limiting Controller
 * Administrative endpoints for managing and monitoring rate limits
 */
@ApiTags('rate-limiting')
@ApiBearerAuth()
@Controller('admin/rate-limits')
@UseGuards(JwtAuthGuard)
@SkipRateLimit() // Admin endpoints should not be rate limited
@TenantScoped()
export class RateLimitingController {
  constructor(private readonly rateLimitingService: RateLimitingService) {}

  /**
   * Get rate limit status for current user
   */
  @Get('status')
  @ApiOperation({ summary: 'Get current rate limit status' })
  @ApiResponse({
    status: 200,
    description: 'Rate limit status retrieved successfully',
  })
  async getStatus(@Request() req: any): Promise<RateLimitStatusDto> {
    const key = this.rateLimitingService.createKey('general', req.user?.id, req.ip, req.tenantId);
    const result = await this.rateLimitingService.checkRateLimit(key, {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 100,
      keyPrefix: 'rl:general',
    });

    return {
      key,
      currentRequests: result.currentRequests,
      maxRequests: 100,
      remainingRequests: result.remainingRequests,
      resetTime: new Date(Date.now() + result.timeUntilReset),
      blocked: !result.allowed,
    };
  }

  /**
   * Get comprehensive rate limiting statistics (Admin only)
   */
  @Get('stats')
  @ApiOperation({ summary: 'Get rate limiting statistics' })
  @ApiResponse({
    status: 200,
    description: 'Rate limiting statistics retrieved successfully',
  })
  @RequirePermissions(PermissionAction.READ, PermissionResource.SYSTEM)
  async getStats(): Promise<RateLimitStatsDto> {
    const stats = await this.rateLimitingService.getGlobalStats();
    
    return {
      totalKeys: stats.totalKeys,
      activeKeys: stats.activeKeys,
      blockedKeys: stats.blockedKeys,
      topBlockedIps: stats.topBlockedIps?.slice(0, 10),
      topUsers: stats.topUsers?.slice(0, 10),
    };
  }

  /**
   * Clear rate limit for a specific key (Admin only)
   */
  @Delete(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear rate limit for a specific key' })
  @ApiResponse({
    status: 204,
    description: 'Rate limit cleared successfully',
  })
  @RequirePermissions(PermissionAction.DELETE, PermissionResource.SYSTEM)
  async clearRateLimit(@Param('key') key: string): Promise<void> {
    await this.rateLimitingService.clearRateLimit(key);
  }

  /**
   * Clear all rate limits for a specific user (Admin only)
   */
  @Delete('user/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear all rate limits for a specific user' })
  @ApiResponse({
    status: 204,
    description: 'User rate limits cleared successfully',
  })
  @RequirePermissions(PermissionAction.DELETE, PermissionResource.SYSTEM)
  async clearUserRateLimits(@Param('userId') userId: string): Promise<void> {
    await this.rateLimitingService.clearUserRateLimits(userId);
  }

  /**
   * Clear all rate limits for a specific IP (Admin only)
   */
  @Delete('ip/:ipAddress')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear all rate limits for a specific IP address' })
  @ApiResponse({
    status: 204,
    description: 'IP rate limits cleared successfully',
  })
  @RequirePermissions(PermissionAction.DELETE, PermissionResource.SYSTEM)
  async clearIpRateLimits(@Param('ipAddress') ipAddress: string): Promise<void> {
    await this.rateLimitingService.clearIpRateLimits(ipAddress);
  }

  /**
   * Clear all rate limits for current tenant (Admin only)
   */
  @Delete('tenant')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear all rate limits for current tenant' })
  @ApiResponse({
    status: 204,
    description: 'Tenant rate limits cleared successfully',
  })
  @RequirePermissions(PermissionAction.DELETE, PermissionResource.TENANT)
  async clearTenantRateLimits(@Request() req: any): Promise<void> {
    const tenantId = req.tenantId;
    if (tenantId) {
      await this.rateLimitingService.clearTenantRateLimits(tenantId);
    }
  }

  /**
   * Get blocked IPs (Admin only)
   */
  @Get('blocked/ips')
  @ApiOperation({ summary: 'Get list of currently blocked IP addresses' })
  @ApiResponse({
    status: 200,
    description: 'Blocked IPs retrieved successfully',
  })
  @RequirePermissions(PermissionAction.READ, PermissionResource.SYSTEM)
  async getBlockedIps(): Promise<string[]> {
    return this.rateLimitingService.getBlockedIps();
  }

  /**
   * Get blocked users (Admin only)
   */
  @Get('blocked/users')
  @ApiOperation({ summary: 'Get list of currently blocked users' })
  @ApiResponse({
    status: 200,
    description: 'Blocked users retrieved successfully',
  })
  @RequirePermissions(PermissionAction.READ, PermissionResource.SYSTEM)
  async getBlockedUsers(): Promise<string[]> {
    return this.rateLimitingService.getBlockedUsers();
  }

  /**
   * Test endpoint for rate limiting (useful for development/testing)
   */
  @Get('test')
  @ApiOperation({ summary: 'Test rate limiting functionality' })
  @ApiResponse({
    status: 200,
    description: 'Rate limit test completed',
  })
  async testRateLimit(@Request() req: any): Promise<{
    message: string;
    rateLimitInfo: any;
    requestCount: number;
    timestamp: Date;
  }> {
    const key = this.rateLimitingService.createKey('test', req.user?.id, req.ip, req.tenantId);
    const result = await this.rateLimitingService.checkRateLimit(key, {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 10,
      keyPrefix: 'rl:test',
    });

    return {
      message: result.allowed 
        ? 'Request allowed' 
        : 'Request blocked due to rate limit',
      rateLimitInfo: {
        currentRequests: result.currentRequests,
        remainingRequests: result.remainingRequests,
        resetTime: new Date(Date.now() + result.timeUntilReset),
      },
      requestCount: result.currentRequests,
      timestamp: new Date(),
    };
  }
}
