import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { TenantIsolationService } from '../services/tenant-isolation.service';
import { RlsManagerService } from '../services/rls-manager.service';
import { TenantContextService } from '../services/tenant-context.service';
import { EnhancedRolesGuard } from '../../rbac/guards/enhanced-roles.guard';
import { TenantScopedGuard } from '../guards/tenant-scoped.guard';
import { 
  SuperAdminOnly, 
  CurrentUser, 
  UserId 
} from '../../rbac/decorators/enhanced-roles.decorator';
import { 
  CurrentTenantId,
  CurrentTenantContext,
  TenantScoped,
  AllowCrossTenantAccess
} from '../decorators/tenant-scoped.decorator';

@ApiTags('Tenant Isolation Administration')
@Controller('admin/tenant-isolation')
@UseGuards(EnhancedRolesGuard, TenantScopedGuard)
export class TenantIsolationController {
  private readonly logger = new Logger(TenantIsolationController.name);

  constructor(
    private readonly tenantIsolationService: TenantIsolationService,
    private readonly rlsManagerService: RlsManagerService,
    private readonly tenantContextService: TenantContextService
  ) {}

  @Post('rls/setup')
  @HttpCode(HttpStatus.OK)
  @SuperAdminOnly()
  @AllowCrossTenantAccess()
  @ApiOperation({
    summary: 'Setup RLS policies',
    description: 'Initialize PostgreSQL Row-Level Security policies for tenant isolation'
  })
  async setupRlsPolicies(@CurrentUser() user: any) {
    this.logger.log(`Super Admin ${user.email} is setting up RLS policies`);
    
    await this.rlsManagerService.setupRlsPolicies();
    
    return {
      success: true,
      message: 'RLS policies set up successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('rls/validate')
  @SuperAdminOnly()
  @AllowCrossTenantAccess()
  @ApiOperation({
    summary: 'Validate RLS policies',
    description: 'Check if RLS policies are properly configured'
  })
  async validateRlsPolicies() {
    const validation = await this.rlsManagerService.validateRlsPolicies();
    
    return {
      success: validation.isValid,
      validation,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('rls/test/:tenantId')
  @SuperAdminOnly()
  @AllowCrossTenantAccess()
  @ApiOperation({
    summary: 'Test RLS policies',
    description: 'Test RLS policies with a specific tenant context'
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID to test with' })
  async testRlsPolicies(
    @Param('tenantId') tenantId: string,
    @UserId() userId: string
  ) {
    const testResults = await this.rlsManagerService.testRlsPolicies(tenantId, userId);
    
    return {
      success: testResults.success,
      tests: testResults.tests,
      tenantId,
      testedBy: userId,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('rls/remove')
  @HttpCode(HttpStatus.OK)
  @SuperAdminOnly()
  @AllowCrossTenantAccess()
  @ApiOperation({
    summary: 'Remove RLS policies',
    description: 'WARNING: This will remove all RLS policies and disable tenant isolation at the database level'
  })
  async removeRlsPolicies(@CurrentUser() user: any) {
    this.logger.warn(`Super Admin ${user.email} is removing RLS policies`);
    
    await this.rlsManagerService.removeRlsPolicies();
    
    return {
      success: true,
      message: 'RLS policies removed successfully',
      warning: 'Tenant isolation is no longer enforced at the database level',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('context/current')
  @TenantScoped()
  @ApiOperation({
    summary: 'Get current tenant context',
    description: 'Display the current tenant context for the authenticated user'
  })
  getCurrentTenantContext(
    @CurrentTenantId() tenantId: string,
    @CurrentTenantContext() tenantContext: any,
    @CurrentUser() user: any
  ) {
    return {
      success: true,
      context: {
        tenantId,
        tenantName: tenantContext?.tenantName,
        userId: user.id,
        userEmail: user.email,
        userRoles: tenantContext?.userRoles || [],
        requestId: tenantContext?.requestId,
        contextSource: 'tenant_context_service',
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Post('context/validate/:targetTenantId')
  @SuperAdminOnly()
  @AllowCrossTenantAccess()
  @ApiOperation({
    summary: 'Validate tenant access',
    description: 'Validate if a user has access to a specific tenant'
  })
  async validateTenantAccess(
    @Param('targetTenantId') targetTenantId: string,
    @Body() body: { userId: string }
  ) {
    const { userId } = body;
    
    const hasAccess = await this.tenantIsolationService.validateUserTenantAccess(
      userId,
      targetTenantId
    );
    
    return {
      success: true,
      validation: {
        userId,
        targetTenantId,
        hasAccess,
        result: hasAccess ? 'ALLOWED' : 'DENIED',
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('tenants/:tenantId/users')
  @SuperAdminOnly()
  @AllowCrossTenantAccess()
  @ApiOperation({
    summary: 'Get tenant users (Super Admin)',
    description: 'Get all users belonging to a specific tenant (cross-tenant access for Super Admins)'
  })
  async getTenantUsers(@Param('tenantId') tenantId: string) {
    // This will test cross-tenant access for Super Admins
    const tenantContext = await this.tenantIsolationService.createTenantContext(tenantId);
    
    return {
      success: true,
      tenantInfo: tenantContext,
      message: `Cross-tenant access granted to tenant ${tenantId}`,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('isolation/health')
  @TenantScoped()
  @ApiOperation({
    summary: 'Tenant isolation health check',
    description: 'Check the health of tenant isolation systems'
  })
  async isolationHealthCheck(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() user: any
  ) {
    try {
      // Test tenant context
      const tenantContext = this.tenantContextService.getTenantContext();
      const contextHealthy = !!tenantContext && tenantContext.tenantId === tenantId;

      // Test RLS validation (simplified)
      const rlsValidation = await this.rlsManagerService.validateRlsPolicies();
      
      // Test user-tenant association
      const userTenantValid = await this.tenantIsolationService.validateUserTenantAccess(
        user.id,
        tenantId
      );

      const allHealthy = contextHealthy && rlsValidation.isValid && userTenantValid;

      return {
        success: true,
        health: allHealthy ? 'healthy' : 'issues_detected',
        checks: {
          tenantContext: {
            healthy: contextHealthy,
            details: contextHealthy ? 'Context available and valid' : 'Context missing or invalid',
            tenantId: tenantContext?.tenantId,
            userId: tenantContext?.userId,
          },
          rlsPolicies: {
            healthy: rlsValidation.isValid,
            details: `${rlsValidation.policies.length} policies found, ${rlsValidation.issues.length} issues`,
            issueCount: rlsValidation.issues.length,
          },
          userTenantAccess: {
            healthy: userTenantValid,
            details: userTenantValid ? 'User belongs to tenant' : 'User does not belong to tenant',
          },
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        health: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('debug/context')
  @TenantScoped()
  @ApiOperation({
    summary: 'Debug tenant context',
    description: 'Get detailed debugging information about tenant context'
  })
  debugTenantContext(
    @CurrentTenantContext() tenantContext: any,
    @CurrentUser() user: any
  ) {
    // Get detailed context information for debugging
    const asyncContext = this.tenantContextService.getTenantContext();
    
    return {
      success: true,
      debug: {
        requestTenantContext: tenantContext,
        asyncLocalStorageContext: asyncContext,
        userInfo: {
          id: user.id,
          email: user.email,
          tenantId: user.tenantId,
        },
        contextComparison: {
          requestTenantId: tenantContext?.tenantId,
          asyncTenantId: asyncContext?.tenantId,
          userTenantId: user.tenantId,
          allMatch: tenantContext?.tenantId === asyncContext?.tenantId && 
                   asyncContext?.tenantId === user.tenantId,
        },
        securityChecks: {
          hasTenantContext: !!tenantContext,
          hasAsyncContext: !!asyncContext,
          tenantIdConsistent: tenantContext?.tenantId === user.tenantId,
          userIdConsistent: tenantContext?.userId === user.id,
        },
      },
      contextSummary: this.tenantContextService.getContextSummary(),
      timestamp: new Date().toISOString(),
    };
  }
}
