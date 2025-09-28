import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';

// Interface for tenant context
interface TenantContext {
  tenantId: string;
  userId?: string | undefined;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly tenantStorage = new AsyncLocalStorage<TenantContext>();

  // Tables that require tenant isolation
  private readonly tenantIsolatedTables = new Set([
    'users',
    'userProfiles', 
    'files',
    'notifications',
    'auditLogs',
    'subscriptions',
    // Add more tables as needed
  ]);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
    });

    // Add tenant isolation middleware
    this.setupTenantIsolation();
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Enable shutdown hooks for graceful shutdown
   */
  async enableShutdownHooks() {
    process.on('beforeExit', async () => {
      await this.$disconnect();
    });
  }

  /**
   * Setup tenant isolation middleware
   */
  private setupTenantIsolation() {
    // TODO: Restore query middleware for automatic tenant filtering after Prisma v5 update
    // Prisma $use middleware is not available in current version
    this.logger.log('Tenant isolation middleware temporarily disabled during Prisma migration');
  }

  /**
   * Set tenant context for the current execution
   */
  setTenantContext(tenantId: string, userId?: string | undefined): void {
    const context: TenantContext = { tenantId, userId: userId || undefined };
    this.tenantStorage.enterWith(context);
    this.logger.debug(`Tenant context set: ${JSON.stringify(context)}`);
  }

  /**
   * Get current tenant context
   */
  getTenantContext(): TenantContext | undefined {
    return this.tenantStorage.getStore();
  }

  /**
   * Execute a function within a tenant context
   */
  async withTenantContext<T>(
    tenantId: string,
    fn: () => Promise<T>,
    userId?: string | undefined
  ): Promise<T> {
    const context: TenantContext = { tenantId, userId: userId || undefined };
    return this.tenantStorage.run(context, fn);
  }

  /**
   * Execute a query with explicit tenant context (for administrative operations)
   */
  async withAdminContext<T>(fn: () => Promise<T>): Promise<T> {
    // Admin context bypasses tenant isolation
    return this.tenantStorage.run(undefined as any, fn);
  }

  /**
   * Validate that current operation has proper tenant context
   */
  validateTenantContext(): void {
    const context = this.getTenantContext();
    if (!context?.tenantId) {
      throw new Error('Tenant context is required for this operation');
    }
  }

  /**
   * Check if a table requires tenant isolation
   */
  isTenantIsolatedTable(tableName: string): boolean {
    return this.tenantIsolatedTables.has(tableName);
  }

  /**
   * Add a table to tenant isolation
   */
  addTenantIsolatedTable(tableName: string): void {
    this.tenantIsolatedTables.add(tableName);
    this.logger.debug(`Added table '${tableName}' to tenant isolation`);
  }

  /**
   * Remove a table from tenant isolation
   */
  removeTenantIsolatedTable(tableName: string): void {
    this.tenantIsolatedTables.delete(tableName);
    this.logger.debug(`Removed table '${tableName}' from tenant isolation`);
  }
}
