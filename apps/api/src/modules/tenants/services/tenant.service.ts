import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { validate as validateUUID } from 'uuid';
import { PrismaService } from '../../../database/prisma.service';
import { 
  Tenant, 
  TenantUsage, 
  TenantUsageMetric, 
  TenantFeatureFlag, 
  TenantFeature 
} from '@prisma/client';
import { CreateTenantDto, UpdateTenantDto, TenantQueryDto } from '../dto';

export interface TenantStatistics {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  verifiedTenants: number;
  tenantsByPlan: Record<string, number>;
  recentTenants: number;
  growthRate: number;
}

export interface TenantUsageSummary {
  tenantId: string;
  tenantName: string;
  currentUsage: Record<TenantUsageMetric, number>;
  limits: Record<TenantUsageMetric, number>;
  usagePercentage: Record<TenantUsageMetric, number>;
  isOverLimit: Record<TenantUsageMetric, boolean>;
}

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    private readonly prisma: PrismaService
  ) {}

  /**
   * Create a new tenant
   */
  async createTenant(createTenantDto: CreateTenantDto): Promise<Tenant> {
    this.logger.log(`Creating new tenant: ${createTenantDto.name}`);

    // Check for name uniqueness
    const existingTenantByName = await this.prisma.tenant.findFirst({
      where: { 
        name: createTenantDto.name,
        isActive: true // Only check active tenants for uniqueness
      },
    });

    if (existingTenantByName) {
      throw new ConflictException(
        `Tenant with name "${createTenantDto.name}" already exists`
      );
    }

    // Check for domain uniqueness if provided
    if (createTenantDto.domain) {
      const existingTenantByDomain = await this.prisma.tenant.findFirst({
        where: { 
          domain: createTenantDto.domain,
          isActive: true // Only check active tenants for uniqueness
        },
      });

      if (existingTenantByDomain) {
        throw new ConflictException(
          `Tenant with domain "${createTenantDto.domain}" already exists`
        );
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Create the tenant
        const tenant = await tx.tenant.create({
          data: {
            name: createTenantDto.name,
            domain: createTenantDto.domain || null,
            slug: createTenantDto.slug || createTenantDto.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            settings: createTenantDto.settings || {},
            logoUrl: createTenantDto.logoUrl || null,
            isActive: true,
          },
        });

        // Initialize tenant usage tracking
        await this.initializeTenantUsage(tenant.id, tx);

        // Set up default feature flags
        await this.initializeDefaultFeatureFlags(tenant.id, tx);

        this.logger.log(`Successfully created tenant: ${tenant.id}`);
        return tenant;
      });
    } catch (error) {
      this.logger.error(`Failed to create tenant ${createTenantDto.name}:`, error);
      throw new BadRequestException('Failed to create tenant');
    }
  }

  /**
   * Find all tenants with optional filtering
   */
  async findAllTenants(query: TenantQueryDto): Promise<{
    tenants: Tenant[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      isActive,
    } = query;

    const skip = (page - 1) * limit;

    // Build where conditions
    const where: any = {};
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { domain: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    // Get total count
    const total = await this.prisma.tenant.count({ where });

    // Get tenants
    const tenants = await this.prisma.tenant.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        users: {
          select: { id: true, isActive: true }
        },
        subscriptions: {
          select: { id: true, status: true }
        }
      }
    });

    const totalPages = Math.ceil(total / limit);

    return {
      tenants,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Find tenant by ID
   */
  async findTenantById(id: string): Promise<Tenant | null> {
    if (!validateUUID(id)) {
      throw new BadRequestException('Invalid tenant ID format');
    }

    return this.prisma.tenant.findFirst({
      where: { 
        id,
        isActive: true 
      },
      include: {
        users: {
          select: { 
            id: true, 
            email: true, 
            firstName: true, 
            lastName: true, 
            isActive: true,
            status: true 
          }
        },
        subscriptions: true,
        tenantFeatureFlags: true,
        tenantUsage: true
      }
    });
  }

  /**
   * Find tenant by domain
   */
  async findTenantByDomain(domain: string): Promise<Tenant | null> {
    return this.prisma.tenant.findFirst({
      where: { 
        domain,
        isActive: true 
      },
    });
  }

  /**
   * Find tenant by slug
   */
  async findTenantBySlug(slug: string): Promise<Tenant | null> {
    return this.prisma.tenant.findFirst({
      where: { 
        slug,
        isActive: true 
      },
    });
  }

  /**
   * Update tenant
   */
  async updateTenant(id: string, updateTenantDto: UpdateTenantDto): Promise<Tenant> {
    if (!validateUUID(id)) {
      throw new BadRequestException('Invalid tenant ID format');
    }

    // Check if tenant exists
    const existingTenant = await this.findTenantById(id);
    if (!existingTenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Check for name uniqueness if name is being updated
    if (updateTenantDto.name && updateTenantDto.name !== existingTenant.name) {
      const existingTenantByName = await this.prisma.tenant.findFirst({
        where: { 
          name: updateTenantDto.name,
          isActive: true,
          id: { not: id }
        },
      });

      if (existingTenantByName) {
        throw new ConflictException(
          `Tenant with name "${updateTenantDto.name}" already exists`
        );
      }
    }

    // Check for domain uniqueness if domain is being updated
    if (updateTenantDto.domain && updateTenantDto.domain !== existingTenant.domain) {
      const existingTenantByDomain = await this.prisma.tenant.findFirst({
        where: { 
          domain: updateTenantDto.domain,
          isActive: true,
          id: { not: id }
        },
      });

      if (existingTenantByDomain) {
        throw new ConflictException(
          `Tenant with domain "${updateTenantDto.domain}" already exists`
        );
      }
    }

    try {
      const updatedTenant = await this.prisma.tenant.update({
        where: { id },
        data: {
          ...(updateTenantDto.name && { name: updateTenantDto.name }),
          ...(updateTenantDto.domain !== undefined && { domain: updateTenantDto.domain }),
          ...(updateTenantDto.slug && { slug: updateTenantDto.slug }),
          ...(updateTenantDto.settings && { settings: updateTenantDto.settings }),
          ...(updateTenantDto.logoUrl !== undefined && { logoUrl: updateTenantDto.logoUrl }),
          updatedAt: new Date(),
        },
      });

      this.logger.log(`Successfully updated tenant: ${id}`);
      return updatedTenant;
    } catch (error) {
      this.logger.error(`Failed to update tenant ${id}:`, error);
      throw new BadRequestException('Failed to update tenant');
    }
  }

  /**
   * Soft delete tenant
   */
  async deleteTenant(id: string): Promise<void> {
    if (!validateUUID(id)) {
      throw new BadRequestException('Invalid tenant ID format');
    }

    const tenant = await this.findTenantById(id);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Check if tenant has active users
    const activeUserCount = await this.prisma.user.count({
      where: {
        tenantId: id,
        isActive: true
      }
    });

    if (activeUserCount > 0) {
      throw new BadRequestException(
        `Cannot delete tenant with ${activeUserCount} active users. Deactivate users first.`
      );
    }

    try {
      await this.prisma.tenant.update({
        where: { id },
        data: { 
          isActive: false,
          updatedAt: new Date()
        }
      });

      this.logger.log(`Successfully deleted tenant: ${id}`);
    } catch (error) {
      this.logger.error(`Failed to delete tenant ${id}:`, error);
      throw new BadRequestException('Failed to delete tenant');
    }
  }

  /**
   * Verify tenant (admin operation)
   */
  async verifyTenant(id: string): Promise<Tenant> {
    if (!validateUUID(id)) {
      throw new BadRequestException('Invalid tenant ID format');
    }

    const tenant = await this.findTenantById(id);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const updatedTenant = await this.prisma.tenant.update({
      where: { id },
      data: {
        // Assuming there would be verification fields in settings
        settings: {
          ...((tenant.settings as any) || {}),
          isVerified: true,
          verifiedAt: new Date().toISOString()
        },
        updatedAt: new Date()
      }
    });

    this.logger.log(`Successfully verified tenant: ${id}`);
    return updatedTenant;
  }

  /**
   * Get tenant statistics (admin dashboard)
   */
  async getTenantStatistics(): Promise<TenantStatistics> {
    const [
      totalTenants,
      activeTenants,
      // Note: trial and verified would need additional schema fields
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { isActive: true } }),
    ]);

    // Get recent tenants (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentTenants = await this.prisma.tenant.count({
      where: {
        createdAt: { gte: thirtyDaysAgo }
      }
    });

    // Calculate growth rate (simplified)
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const previousPeriodTenants = await this.prisma.tenant.count({
      where: {
        createdAt: { 
          gte: sixtyDaysAgo,
          lt: thirtyDaysAgo
        }
      }
    });

    const growthRate = previousPeriodTenants > 0 
      ? ((recentTenants - previousPeriodTenants) / previousPeriodTenants) * 100 
      : 0;

    return {
      totalTenants,
      activeTenants,
      trialTenants: 0, // Would need additional schema
      verifiedTenants: 0, // Would need additional schema  
      tenantsByPlan: {}, // Would need subscription integration
      recentTenants,
      growthRate,
    };
  }

  /**
   * Track tenant usage
   */
  async trackTenantUsage(
    tenantId: string,
    metric: TenantUsageMetric,
    value: number,
    limit?: number
  ): Promise<TenantUsage> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find or create usage record for today
    let usageRecord = await this.prisma.tenantUsage.findFirst({
      where: {
        tenantId,
        metric,
        period: today,
      }
    });

    if (usageRecord) {
      usageRecord = await this.prisma.tenantUsage.update({
        where: { id: usageRecord.id },
        data: {
          value: value,
          updatedAt: new Date()
        }
      });
    } else {
      usageRecord = await this.prisma.tenantUsage.create({
        data: {
          tenantId,
          metric,
          period: today,
          value,
        }
      });
    }

    this.logger.log(`Tracked usage for tenant ${tenantId}: ${metric} = ${value}`);
    return usageRecord;
  }

  /**
   * Get tenant usage summary
   */
  async getTenantUsage(tenantId: string): Promise<TenantUsageSummary> {
    const tenant = await this.findTenantById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get current usage
    const usageRecords = await this.prisma.tenantUsage.findMany({
      where: {
        tenantId,
        period: today,
      }
    });

    // Initialize usage and limits
    const currentUsage: Record<TenantUsageMetric, number> = {
      [TenantUsageMetric.API_CALLS]: 0,
      [TenantUsageMetric.STORAGE_BYTES]: 0,
      [TenantUsageMetric.USERS]: 0,
      [TenantUsageMetric.EMAILS_SENT]: 0,
      [TenantUsageMetric.FILES_UPLOADED]: 0,
      [TenantUsageMetric.DATABASE_QUERIES]: 0,
      [TenantUsageMetric.WEBSOCKET_CONNECTIONS]: 0,
      [TenantUsageMetric.BACKGROUND_JOBS]: 0,
      [TenantUsageMetric.STORAGE]: 0,
      [TenantUsageMetric.BANDWIDTH]: 0,
      [TenantUsageMetric.CUSTOM_FIELDS]: 0,
    };

    const limits: Record<TenantUsageMetric, number> = {
      [TenantUsageMetric.API_CALLS]: 10000,
      [TenantUsageMetric.STORAGE_BYTES]: 1024 * 1024 * 1024, // 1GB
      [TenantUsageMetric.USERS]: 100,
      [TenantUsageMetric.EMAILS_SENT]: 1000,
      [TenantUsageMetric.FILES_UPLOADED]: 500,
      [TenantUsageMetric.DATABASE_QUERIES]: 50000,
      [TenantUsageMetric.WEBSOCKET_CONNECTIONS]: 100,
      [TenantUsageMetric.BACKGROUND_JOBS]: 1000,
      [TenantUsageMetric.STORAGE]: 1024 * 1024 * 1024, // 1GB
      [TenantUsageMetric.BANDWIDTH]: 1024 * 1024 * 1024, // 1GB
      [TenantUsageMetric.CUSTOM_FIELDS]: 50,
    };

    // Populate current usage from records
    usageRecords.forEach(record => {
      currentUsage[record.metric] = record.value;
    });

    // Calculate usage percentages and over-limit flags
    const usagePercentage: Record<TenantUsageMetric, number> = {} as any;
    const isOverLimit: Record<TenantUsageMetric, boolean> = {} as any;

    Object.keys(currentUsage).forEach(key => {
      const metric = key as TenantUsageMetric;
      const usage = currentUsage[metric];
      const limit = limits[metric];
      
      usagePercentage[metric] = limit > 0 ? (usage / limit) * 100 : 0;
      isOverLimit[metric] = usage > limit;
    });

    return {
      tenantId,
      tenantName: tenant.name,
      currentUsage,
      limits,
      usagePercentage,
      isOverLimit,
    };
  }

  /**
   * Check if feature is enabled for tenant
   */
  async isFeatureEnabled(tenantId: string, feature: TenantFeature): Promise<boolean> {
    const featureFlag = await this.prisma.tenantFeatureFlag.findFirst({
      where: { tenantId, feature }
    });

    return featureFlag?.enabled ?? false;
  }

  /**
   * Enable/disable feature for tenant
   */
  async setFeatureFlag(
    tenantId: string,
    feature: TenantFeature,
    isEnabled: boolean,
    config?: Record<string, any>
  ): Promise<TenantFeatureFlag> {
    // Find existing feature flag
    let featureFlag = await this.prisma.tenantFeatureFlag.findFirst({
      where: { tenantId, feature }
    });

    if (featureFlag) {
      // Update existing
      featureFlag = await this.prisma.tenantFeatureFlag.update({
        where: { id: featureFlag.id },
        data: {
          enabled: isEnabled,
          updatedAt: new Date()
        }
      });
    } else {
      // Create new
      featureFlag = await this.prisma.tenantFeatureFlag.create({
        data: {
          tenantId,
          feature,
          enabled: isEnabled,
        }
      });
    }

    this.logger.log(`Feature ${feature} ${isEnabled ? 'enabled' : 'disabled'} for tenant ${tenantId}`);
    return featureFlag;
  }

  /**
   * Alias for setFeatureFlag (for backward compatibility)
   */
  async updateFeatureFlag(
    tenantId: string,
    feature: TenantFeature,
    isEnabled: boolean,
    config?: Record<string, any>
  ): Promise<TenantFeatureFlag> {
    return this.setFeatureFlag(tenantId, feature, isEnabled, config);
  }

  /**
   * Get all enabled features for tenant
   */
  async getEnabledFeatures(tenantId: string): Promise<TenantFeature[]> {
    const enabledFlags = await this.prisma.tenantFeatureFlag.findMany({
      where: { tenantId, enabled: true },
    });

    return enabledFlags.map(flag => flag.feature);
  }

  /**
   * Initialize default feature flags for new tenant
   */
  private async initializeDefaultFeatureFlags(tenantId: string, tx?: any): Promise<void> {
    const prisma = tx || this.prisma;
    
    const defaultFeatures = [
      TenantFeature.ANALYTICS,
      TenantFeature.TEAM_MANAGEMENT,
      TenantFeature.AUDIT_LOGS,
      TenantFeature.EMAIL_TEMPLATES,
    ];

    const featureFlags = defaultFeatures.map(feature => ({
      tenantId,
      feature,
      enabled: true,
    }));

    await prisma.tenantFeatureFlag.createMany({
      data: featureFlags,
    });

    this.logger.log(`Initialized default features for tenant: ${tenantId}`);
  }

  /**
   * Initialize tenant usage tracking
   */
  private async initializeTenantUsage(tenantId: string, tx?: any): Promise<void> {
    const prisma = tx || this.prisma;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Initialize usage tracking for all metrics
    const metrics = Object.values(TenantUsageMetric);
    const usageRecords = metrics.map(metric => ({
      tenantId,
      metric,
      period: today,
      value: 0,
    }));

    await prisma.tenantUsage.createMany({
      data: usageRecords,
    });

    this.logger.log(`Initialized usage tracking for tenant: ${tenantId}`);
  }
}