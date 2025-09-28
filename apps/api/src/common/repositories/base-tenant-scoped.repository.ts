import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TenantContext } from '../context/tenant.context';
import { Prisma } from '@prisma/client';

@Injectable()
export abstract class BaseTenantScopedRepository {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(protected readonly prisma: PrismaService) {}

  /**
   * Get the current tenant ID from context
   */
  protected getTenantId(): string | undefined {
    return TenantContext.getTenantId();
  }

  /**
   * Require tenant context or throw error
   */
  protected requireTenantId(): string {
    const tenantId = this.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context is required for this operation');
    }
    return tenantId;
  }

  /**
   * Add tenant scope to where conditions
   */
  protected addTenantScope<T extends Record<string, any>>(
    where: T,
    tenantIdField: string = 'tenantId'
  ): T & { [key: string]: string } {
    const tenantId = this.getTenantId();
    if (!tenantId) {
      return where;
    }
    
    return {
      ...where,
      [tenantIdField]: tenantId
    };
  }

  /**
   * Execute operation with tenant context
   */
  protected async withTenantContext<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    const tenantId = this.getTenantId();
    if (tenantId) {
      return this.prisma.withTenantContext(tenantId, operation);
    }
    return operation();
  }

  /**
   * Log tenant-scoped operation
   */
  protected logTenantOperation(operation: string, entityType: string, entityId?: string): void {
    const tenantId = this.getTenantId();
    this.logger.debug(
      `${operation} ${entityType}${entityId ? ` (${entityId})` : ''} for tenant ${tenantId || 'NO_TENANT'}`
    );
  }
}
