import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { UserTenantMembership } from '../entities';
import { User } from '@prisma/client';
import { AuditEventType } from '../../audit/entities/audit-log.entity';
import { AuditService } from '../../audit/services/audit.service';
import { TenantAccessControlService } from './access/tenant-access-control.service';
import { TenantAccessVerificationService } from './access/tenant-access-verification.service';
import { TenantMembershipService } from './membership/tenant-membership.service';
import { TenantCacheService } from './cache/tenant-cache.service';
import { TenantJwtService } from './auth/tenant-jwt.service';
import {
  TenantSwitchDto,
  TenantSwitchResponseDto,
  TenantMembershipDto,
  UserTenantMembershipsResponseDto,
} from '../dto';
import { MembershipStatus } from '@app/shared';

@Injectable()
export class TenantSwitchingService {
  private readonly logger = new Logger(TenantSwitchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly accessControl: TenantAccessControlService,
    private readonly accessVerification: TenantAccessVerificationService,
    private readonly membershipService: TenantMembershipService,
    private readonly cacheService: TenantCacheService,
    private readonly jwtService: TenantJwtService
  ) {}

  /**
   * Get all tenant memberships for a user
   */
  async getUserTenantMemberships(
    userId: string
  ): Promise<UserTenantMembershipsResponseDto> {
    this.logger.debug(`Getting tenant memberships for user: ${userId}`);

    const result =
      await this.membershipService.getUserTenantMemberships(userId);

    // Transform to DTO format
    const membershipDtos: TenantMembershipDto[] = result.memberships.map(
      membership => ({
        id: membership.id,
        tenant: {
          id: membership.tenant.id,
          name: membership.tenant.name,
          ...(membership.tenant.domain && { domain: membership.tenant.domain }),
          plan: membership.tenant.plan,
          features: membership.tenant.features || [],
          settings: membership.tenant.settings || {},
        },
        role: membership.role,
        status: membership.status,
        joinedAt: membership.joinedAt,
        ...(membership.lastAccessedAt && {
          lastAccessedAt: membership.lastAccessedAt,
        }),
        ...(membership.expiresAt && { expiresAt: membership.expiresAt }),
        permissions: membership.permissions?.map(p => p.getFullName()) || [],
        isCurrentTenant: membership.tenantId === result.currentTenantId,
        isActive: membership.isActive,
        isExpired: membership.isExpired,
      })
    );

    return {
      memberships: membershipDtos,
      currentTenantId: result.currentTenantId || '',
      totalCount: result.totalCount,
      activeCount: result.activeCount,
      pendingCount: result.pendingCount,
    };
  }

  /**
   * Switch user's current tenant context
   */
  async switchTenant(
    userId: string,
    switchDto: TenantSwitchDto
  ): Promise<TenantSwitchResponseDto> {
    this.logger.debug(
      `User ${userId} attempting to switch to tenant: ${switchDto.tenantId}`
    );

    // Use Prisma transaction instead of TypeORM
    return await this.prisma.$transaction(async (tx) => {
      // Verify user has access to the target tenant
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { tenant: true },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      const targetTenant = await tx.tenant.findUnique({
        where: { id: switchDto.tenantId },
      });

      if (!targetTenant) {
        this.logger.warn(
          `User ${userId} attempted to switch to non-existent tenant: ${switchDto.tenantId}`
        );
        throw new ForbiddenException('Target tenant not found');
      }

      // TODO: Add proper membership verification once User-Tenant relationship is established
      // For now, we'll allow switching if both user and tenant exist

      const previousTenantId = user.tenantId;

      // Update user's current tenant
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { tenantId: switchDto.tenantId },
        include: { tenant: true },
      });

      // Create audit log entry
      await this.auditService.logActivity({
        userId: user.id,
        userEmail: user.email,
        action: 'tenant.switched',
        // role: membership.role // TODO: Get role from proper relationship
      }, {
        previousTenant: previousTenantId,
        newTenant: switchDto.tenantId,
      });

      // Log success
      this.logger.log(`User ${userId} successfully switched to tenant: ${switchDto.tenantId}`);

      return {
        success: true,
        message: `Successfully switched to tenant: ${targetTenant.name}`,
        tenant: {
          id: targetTenant.id,
          name: targetTenant.name,
          ...(targetTenant.domain && { domain: targetTenant.domain }),
          plan: 'free', // TODO: Get actual plan from tenant relationships
          features: [], // TODO: Get actual features from tenant feature flags
          settings: targetTenant.settings as Record<string, any> || {},
        },
        membership: {
          role: 'member' as any, // TODO: Get actual role from membership relationship
          status: MembershipStatus.ACTIVE,
          joinedAt: user.createdAt,
          lastAccessedAt: new Date(),
          permissions: [], // TODO: Get actual permissions from RBAC system
        },
      };
    });
  }
}
