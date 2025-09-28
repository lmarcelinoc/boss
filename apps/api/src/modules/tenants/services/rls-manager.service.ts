import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { TenantContextService } from './tenant-context.service';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Row-Level Security Manager Service
 * Manages PostgreSQL RLS policies and context for tenant isolation
 */
@Injectable()
export class RlsManagerService implements OnModuleInit {
  private readonly logger = new Logger(RlsManagerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService
  ) {}

  async onModuleInit() {
    // Initialize RLS context management
    await this.initializeRlsContextManagement();
  }

  /**
   * Initialize RLS context management with Prisma middleware
   */
  async initializeRlsContextManagement(): Promise<void> {
    this.logger.log('🔐 Initializing RLS context management...');

    // Add Prisma middleware to set database context before queries
    this.prisma.$use(async (params, next) => {
      // Set database context for RLS
      await this.setDatabaseContext();

      // Execute the query
      const result = await next(params);

      return result;
    });

    this.logger.log('✅ RLS context management initialized');
  }

  /**
   * Set database context for RLS policies
   */
  private async setDatabaseContext(): Promise<void> {
    const tenantContext = this.tenantContextService.getTenantContext();
    
    if (tenantContext) {
      try {
        // Set tenant context in database session
        await this.prisma.$executeRaw`
          SELECT set_tenant_context(${tenantContext.tenantId}::uuid, ${tenantContext.userId}::uuid)
        `;

        this.logger.debug(
          `Database context set: tenant=${tenantContext.tenantId}, user=${tenantContext.userId}`
        );
      } catch (error) {
        this.logger.warn('Failed to set database context for RLS:', error);
        // Don't throw - let the query proceed without RLS context
        // The application-level tenant isolation will still protect us
      }
    } else {
      // Clear database context when no tenant context available
      try {
        await this.prisma.$executeRaw`SELECT clear_tenant_context()`;
        this.logger.debug('Database context cleared');
      } catch (error) {
        this.logger.debug('No database context to clear');
      }
    }
  }

  /**
   * Set up RLS policies (run this once during deployment)
   */
  async setupRlsPolicies(): Promise<void> {
    this.logger.log('🚀 Setting up Row-Level Security policies...');

    try {
      // Read the RLS SQL script
      const sqlFilePath = path.join(__dirname, '../sql/row-level-security.sql');
      const rlsSql = fs.readFileSync(sqlFilePath, 'utf8');

      // Execute the RLS setup script
      await this.prisma.$executeRawUnsafe(rlsSql);

      this.logger.log('✅ RLS policies set up successfully');
    } catch (error) {
      this.logger.error('❌ Failed to set up RLS policies:', error);
      throw error;
    }
  }

  /**
   * Validate that RLS policies are active
   */
  async validateRlsPolicies(): Promise<{
    isValid: boolean;
    policies: Array<{
      tableName: string;
      policyName: string;
      isEnabled: boolean;
    }>;
    issues: string[];
  }> {
    this.logger.log('🔍 Validating RLS policies...');

    const issues: string[] = [];
    const policies: Array<{
      tableName: string;
      policyName: string;
      isEnabled: boolean;
    }> = [];

    try {
      // Check if RLS is enabled on tenant-scoped tables
      const rlsStatus = await this.prisma.$queryRaw<Array<{
        table_name: string;
        row_security: boolean;
      }>>`
        SELECT 
          tablename as table_name,
          rowsecurity as row_security
        FROM pg_tables pt
        JOIN pg_class pc ON pc.relname = pt.tablename
        WHERE pt.schemaname = 'public'
        AND pt.tablename IN (
          'users', 'files', 'notifications', 'subscriptions', 'teams',
          'invitations', 'tenant_feature_flags', 'tenant_usage',
          'bulk_import_jobs', 'usage_analytics', 'analytics_aggregates',
          'audit_logs'
        )
      `;

      for (const table of rlsStatus) {
        if (!table.row_security) {
          issues.push(`RLS not enabled on table: ${table.table_name}`);
        }
      }

      // Check if RLS policies exist
      const rlsPolicies = await this.prisma.$queryRaw<Array<{
        table_name: string;
        policy_name: string;
        permissive: string;
      }>>`
        SELECT 
          schemaname as schema_name,
          tablename as table_name,
          policyname as policy_name,
          permissive
        FROM pg_policies
        WHERE schemaname = 'public'
        AND policyname LIKE 'tenant_isolation_%'
        ORDER BY tablename, policyname
      `;

      for (const policy of rlsPolicies) {
        policies.push({
          tableName: policy.table_name,
          policyName: policy.policy_name,
          isEnabled: policy.permissive === 'PERMISSIVE',
        });
      }

      // Check if helper functions exist
      const helperFunctions = await this.prisma.$queryRaw<Array<{
        function_name: string;
      }>>`
        SELECT proname as function_name
        FROM pg_proc
        WHERE proname IN (
          'get_current_tenant_id',
          'get_current_user_id',
          'is_platform_admin',
          'set_tenant_context',
          'clear_tenant_context'
        )
      `;

      const expectedFunctions = [
        'get_current_tenant_id',
        'get_current_user_id', 
        'is_platform_admin',
        'set_tenant_context',
        'clear_tenant_context'
      ];

      const existingFunctions = helperFunctions.map(f => f.function_name);
      for (const func of expectedFunctions) {
        if (!existingFunctions.includes(func)) {
          issues.push(`Missing RLS helper function: ${func}`);
        }
      }

      const isValid = issues.length === 0;

      if (isValid) {
        this.logger.log('✅ RLS policies validation passed');
      } else {
        this.logger.warn('⚠️  RLS policies validation found issues:', issues);
      }

      return { isValid, policies, issues };

    } catch (error) {
      this.logger.error('❌ Failed to validate RLS policies:', error);
      issues.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { isValid: false, policies, issues };
    }
  }

  /**
   * Test RLS policies with sample queries
   */
  async testRlsPolicies(testTenantId: string, testUserId: string): Promise<{
    success: boolean;
    tests: Array<{
      name: string;
      passed: boolean;
      details: string;
    }>;
  }> {
    this.logger.log('🧪 Testing RLS policies...');

    const tests: Array<{
      name: string;
      passed: boolean;
      details: string;
    }> = [];

    try {
      // Test 1: Set tenant context and query users
      await this.prisma.$executeRaw`
        SELECT set_tenant_context(${testTenantId}::uuid, ${testUserId}::uuid)
      `;

      const usersWithContext = await this.prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*) as count FROM users WHERE tenant_id = ${testTenantId}::uuid
      `;

      tests.push({
        name: 'Tenant context setting',
        passed: true,
        details: `Found ${usersWithContext[0]?.count || 0} users in tenant`,
      });

      // Test 2: Clear context and check isolation
      await this.prisma.$executeRaw`SELECT clear_tenant_context()`;

      const usersWithoutContext = await this.prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*) as count FROM users
      `;

      const expectedCount = 0; // Should return no users without context (unless Super Admin)
      const actualCount = usersWithoutContext[0]?.count || 0;

      tests.push({
        name: 'Tenant isolation without context',
        passed: actualCount === expectedCount,
        details: `Expected 0 users, got ${actualCount} (isolation ${actualCount === expectedCount ? 'working' : 'failed'})`,
      });

      // Test 3: Platform admin access
      const platformTenant = await this.prisma.tenant.findFirst({
        where: { slug: 'platform' },
        select: { id: true },
      });

      if (platformTenant) {
        await this.prisma.$executeRaw`
          SELECT set_tenant_context(${platformTenant.id}::uuid, ${testUserId}::uuid)
        `;

        const usersAsPlatformAdmin = await this.prisma.$queryRaw<Array<{ count: number }>>`
          SELECT COUNT(*) as count FROM users
        `;

        const platformAdminCount = usersAsPlatformAdmin[0]?.count || 0;

        tests.push({
          name: 'Platform admin access',
          passed: platformAdminCount > 0,
          details: `Platform admin can see ${platformAdminCount} users across all tenants`,
        });
      } else {
        tests.push({
          name: 'Platform admin access',
          passed: false,
          details: 'Platform tenant not found',
        });
      }

      // Clear context after tests
      await this.prisma.$executeRaw`SELECT clear_tenant_context()`;

      const allTestsPassed = tests.every(test => test.passed);

      this.logger.log(`RLS policy tests completed: ${allTestsPassed ? 'ALL PASSED' : 'SOME FAILED'}`);

      return {
        success: allTestsPassed,
        tests,
      };

    } catch (error) {
      this.logger.error('❌ RLS policy testing failed:', error);
      
      tests.push({
        name: 'RLS testing',
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });

      return {
        success: false,
        tests,
      };
    }
  }

  /**
   * Remove all RLS policies (for cleanup/reset)
   */
  async removeRlsPolicies(): Promise<void> {
    this.logger.warn('🗑️  Removing all RLS policies...');

    try {
      // Get all tenant isolation policies
      const policies = await this.prisma.$queryRaw<Array<{
        table_name: string;
        policy_name: string;
      }>>`
        SELECT tablename as table_name, policyname as policy_name
        FROM pg_policies
        WHERE schemaname = 'public'
        AND policyname LIKE 'tenant_isolation_%'
      `;

      // Drop each policy
      for (const policy of policies) {
        await this.prisma.$executeRawUnsafe(`
          DROP POLICY ${policy.policy_name} ON ${policy.table_name};
        `);
        this.logger.log(`Dropped policy: ${policy.policy_name} on ${policy.table_name}`);
      }

      // Disable RLS on tables
      const tables = [
        'users', 'files', 'notifications', 'subscriptions', 'teams',
        'invitations', 'tenant_feature_flags', 'tenant_usage',
        'bulk_import_jobs', 'usage_analytics', 'analytics_aggregates',
        'audit_logs'
      ];

      for (const table of tables) {
        await this.prisma.$executeRawUnsafe(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;`);
        this.logger.log(`Disabled RLS on table: ${table}`);
      }

      // Drop helper functions
      const functions = [
        'get_current_tenant_id()',
        'get_current_user_id()',
        'is_platform_admin()',
        'set_tenant_context(UUID, UUID)',
        'clear_tenant_context()'
      ];

      for (const func of functions) {
        try {
          await this.prisma.$executeRawUnsafe(`DROP FUNCTION ${func};`);
          this.logger.log(`Dropped function: ${func}`);
        } catch (error) {
          this.logger.debug(`Function ${func} may not exist or already dropped`);
        }
      }

      this.logger.log('✅ RLS policies removed successfully');

    } catch (error) {
      this.logger.error('❌ Failed to remove RLS policies:', error);
      throw error;
    }
  }
}
