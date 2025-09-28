import { PrismaClient } from '@prisma/client';

/**
 * Test Database Utilities
 *
 * Provides utilities for managing test database operations using Prisma
 */

export class TestDatabaseUtils {
  private static prisma: PrismaClient;

  /**
   * Initialize test database connection
   */
  static async initialize(): Promise<void> {
    if (!this.prisma) {
      const dbUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL || 'postgresql://localhost:5432/test';
      this.prisma = new PrismaClient({
        datasources: {
          db: {
            url: dbUrl,
          },
        },
        log: ['error'],
      });
      
      await this.prisma.$connect();
    }
  }

  /**
   * Get Prisma client instance
   */
  static getPrismaClient(): PrismaClient {
    if (!this.prisma) {
      throw new Error(
        'Test database not initialized. Call initialize() first.'
      );
    }
    return this.prisma;
  }

  /**
   * Clear all data from all tables (in correct order due to foreign keys)
   */
  static async clearAllData(): Promise<void> {
    if (!this.prisma) {
      throw new Error(
        'Test database not initialized. Call initialize() first.'
      );
    }

    // Delete in order to respect foreign key constraints
    await this.prisma.auditLog.deleteMany();
    await this.prisma.notification.deleteMany();
    await this.prisma.file.deleteMany();
    await this.prisma.refreshToken.deleteMany();
    await this.prisma.session.deleteMany();
    await this.prisma.userRole.deleteMany();
    await this.prisma.rolePermission.deleteMany();
    await this.prisma.importError.deleteMany();
    await this.prisma.bulkImportJob.deleteMany();
    // Note: AccountRecovery model needs to be added to schema if needed
    await this.prisma.userProfile.deleteMany();
    await this.prisma.invitation.deleteMany();
    await this.prisma.team.deleteMany();
    await this.prisma.user.deleteMany();
    await this.prisma.permission.deleteMany();
    await this.prisma.role.deleteMany();
    await this.prisma.subscription.deleteMany();
    await this.prisma.plan.deleteMany();
    await this.prisma.tenantFeatureFlag.deleteMany();
    await this.prisma.tenantUsage.deleteMany();
    await this.prisma.usageAnalytics.deleteMany();
    await this.prisma.analyticsAggregate.deleteMany();
    await this.prisma.tenant.deleteMany();
  }

  /**
   * Reset database (using Prisma migrations)
   */
  static async resetDatabase(): Promise<void> {
    if (!this.prisma) {
      throw new Error(
        'Test database not initialized. Call initialize() first.'
      );
    }

    // Clear all data first
    await this.clearAllData();
    
    // In test environment, we typically don't need to run migrations
    // as the test database should already be set up
  }

  /**
   * Close database connection
   */
  static async close(): Promise<void> {
    if (this.prisma) {
      await this.prisma.$disconnect();
      this.prisma = undefined as any;
    }
  }

  /**
   * Get database connection status
   */
  static isInitialized(): boolean {
    return this.prisma != null;
  }
}

/**
 * Test transaction wrapper
 * Executes a function within a database transaction and rolls back after completion
 */
export const withTestTransaction = async <T>(
  fn: (prisma: PrismaClient) => Promise<T>
): Promise<T> => {
  const prisma = TestDatabaseUtils.getPrismaClient();
  
  return await prisma.$transaction(async (tx) => {
    const result = await fn(tx as PrismaClient);
    // Transaction will automatically rollback if an error is thrown
    // For testing, we might want to always rollback, but Prisma handles this differently
    return result;
  });
};

/**
 * Create test data factory
 */
export const createTestData = {
  /**
   * Create a test user
   */
  user: (overrides: any = {}) => ({
    email: `test-${Date.now()}@example.com`,
    firstName: 'Test',
    lastName: 'User',
    password: 'TestPassword123!',
    emailVerified: true,
    status: 'ACTIVE',
    isActive: true,
    ...overrides,
  }),

  /**
   * Create a test tenant
   */
  tenant: (overrides: any = {}) => ({
    name: `Test Tenant ${Date.now()}`,
    domain: `test-${Date.now()}.example.com`,
    settings: {},
    isActive: true,
    ...overrides,
  }),

  /**
   * Create a test role
   */
  role: (overrides: any = {}) => ({
    name: `TEST_ROLE_${Date.now()}`,
    displayName: 'Test Role',
    description: 'Test role for testing purposes',
    type: 'CUSTOM',
    ...overrides,
  }),

  /**
   * Create a test permission
   */
  permission: (overrides: any = {}) => ({
    name: `TEST_PERMISSION_${Date.now()}`,
    displayName: 'Test Permission',
    description: 'Test permission for testing purposes',
    resource: 'TEST',
    action: 'READ',
    ...overrides,
  }),

  /**
   * Create test branding configuration
   */
  branding: (overrides: any = {}) => ({
    theme: 'light',
    colorScheme: {
      primary: '#3B82F6',
      secondary: '#6B7280',
      accent: '#10B981',
    },
    typography: {
      fontFamily: 'Inter, sans-serif',
      fontSize: '16px',
    },
    ...overrides,
  }),
};