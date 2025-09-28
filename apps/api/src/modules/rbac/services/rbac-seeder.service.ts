import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { PermissionService } from './permission-new.service';
import { RoleHierarchyService } from './role-hierarchy.service';

@Injectable()
export class RbacSeederService {
  private readonly logger = new Logger(RbacSeederService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
    private readonly roleHierarchyService: RoleHierarchyService
  ) {}

  async seedRbacSystem(): Promise<void> {
    this.logger.log('🚀 Starting RBAC system seeding...');

    try {
      // 1. Create default permissions
      await this.seedPermissions();

      // 2. Create default roles hierarchy
      await this.seedRoles();

      // 3. Create platform tenant (tenant ID 1)
      await this.seedPlatformTenant();

      // 4. Create default Super Admin user
      await this.seedSuperAdminUser();

      this.logger.log('✅ RBAC system seeding completed successfully!');
    } catch (error) {
      this.logger.error('❌ RBAC system seeding failed:', error);
      throw error;
    }
  }

  private async seedPermissions(): Promise<void> {
    this.logger.log('📋 Seeding permissions...');
    
    await this.permissionService.createDefaultPermissions();
    
    const permissionCount = await this.prisma.permission.count();
    this.logger.log(`✅ Permissions seeded: ${permissionCount} total permissions`);
  }

  private async seedRoles(): Promise<void> {
    this.logger.log('👥 Seeding role hierarchy...');
    
    await this.roleHierarchyService.createDefaultRoles();
    
    const roleCount = await this.prisma.role.count();
    this.logger.log(`✅ Roles seeded: ${roleCount} roles with hierarchical permissions`);

    // Log the role hierarchy
    const roles = await this.prisma.role.findMany({
      orderBy: { level: 'asc' },
      include: {
        rolePermissions: true,
      },
    });

    this.logger.log('📊 Role Hierarchy Summary:');
    for (const role of roles) {
      this.logger.log(
        `  • ${role.name} (Level ${role.level}): ${role.rolePermissions.length} permissions - ${role.description}`
      );
    }
  }

  private async seedPlatformTenant(): Promise<void> {
    this.logger.log('🏢 Seeding platform tenant...');

    // Check if platform tenant already exists
    const existingPlatformTenant = await this.prisma.tenant.findFirst({
      where: { slug: 'platform' },
    });

    if (!existingPlatformTenant) {
      const platformTenant = await this.prisma.tenant.create({
        data: {
          name: 'Platform Administration',
          slug: 'platform',
          domain: null, // Platform tenant doesn't need a custom domain
          settings: {
            isPlatformTenant: true,
            allowUserRegistration: false,
            description: 'Reserved tenant for platform administrators (Super Admins)',
          },
          isActive: true,
        },
      });

      this.logger.log(`✅ Platform tenant created: ${platformTenant.name} (ID: ${platformTenant.id})`);
    } else {
      this.logger.log(`✅ Platform tenant already exists: ${existingPlatformTenant.name}`);
    }
  }

  private async seedSuperAdminUser(): Promise<void> {
    this.logger.log('👤 Seeding Super Admin user...');

    // Check if Super Admin user already exists
    const existingSuperAdmin = await this.prisma.user.findFirst({
      where: { 
        email: 'superadmin@platform.local',
      },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!existingSuperAdmin) {
      // Get platform tenant
      const platformTenant = await this.prisma.tenant.findFirst({
        where: { slug: 'platform' },
      });

      if (!platformTenant) {
        throw new Error('Platform tenant not found. Cannot create Super Admin user.');
      }

      // Get Super Admin role
      const superAdminRole = await this.prisma.role.findUnique({
        where: { name: 'Super Admin' },
      });

      if (!superAdminRole) {
        throw new Error('Super Admin role not found. Cannot create Super Admin user.');
      }

      // Create Super Admin user (using bcrypt in real implementation)
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('SuperAdmin123!', 12);

      const superAdminUser = await this.prisma.user.create({
        data: {
          email: 'superadmin@platform.local',
          password: hashedPassword,
          firstName: 'Platform',
          lastName: 'Administrator',
          emailVerified: true,
          emailVerifiedAt: new Date(),
          status: 'active',
          tenantId: platformTenant.id,
        },
      });

      // Assign Super Admin role
      await this.prisma.userRole.create({
        data: {
          userId: superAdminUser.id,
          roleId: superAdminRole.id,
        },
      });

      this.logger.log(`✅ Super Admin user created: ${superAdminUser.email}`);
      this.logger.log(`🔑 Super Admin credentials:`);
      this.logger.log(`   Email: ${superAdminUser.email}`);
      this.logger.log(`   Password: SuperAdmin123!`);
      this.logger.log(`   ⚠️  CHANGE THIS PASSWORD IN PRODUCTION!`);
    } else {
      const hasSuperAdminRole = existingSuperAdmin.userRoles.some(
        ur => ur.role.name === 'Super Admin'
      );
      
      if (hasSuperAdminRole) {
        this.logger.log(`✅ Super Admin user already exists: ${existingSuperAdmin.email}`);
      } else {
        this.logger.warn(`⚠️  User ${existingSuperAdmin.email} exists but doesn't have Super Admin role!`);
      }
    }
  }

  async validateRbacSystem(): Promise<{
    isValid: boolean;
    summary: {
      permissions: number;
      roles: number;
      platformTenant: boolean;
      superAdminUser: boolean;
    };
    issues: string[];
  }> {
    this.logger.log('🔍 Validating RBAC system...');

    const issues: string[] = [];

    // Count permissions
    const permissionCount = await this.prisma.permission.count();
    if (permissionCount === 0) {
      issues.push('No permissions found in the system');
    }

    // Count roles
    const roleCount = await this.prisma.role.count();
    if (roleCount === 0) {
      issues.push('No roles found in the system');
    }

    // Check platform tenant
    const platformTenant = await this.prisma.tenant.findFirst({
      where: { slug: 'platform' },
    });
    const hasPlatformTenant = !!platformTenant;
    if (!hasPlatformTenant) {
      issues.push('Platform tenant not found');
    }

    // Check Super Admin user
    const superAdminUser = await this.prisma.user.findFirst({
      where: { 
        email: 'superadmin@platform.local',
      },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    const hasSuperAdminUser = superAdminUser && 
      superAdminUser.userRoles.some(ur => ur.role.name === 'Super Admin');

    if (!hasSuperAdminUser) {
      issues.push('Super Admin user not found or not properly configured');
    }

    // Check role hierarchy
    const roles = await this.prisma.role.findMany({
      include: { rolePermissions: true },
      orderBy: { level: 'asc' },
    });

    const expectedRoles = ['Super Admin', 'Owner', 'Admin', 'Manager', 'Member', 'Viewer'];
    for (const expectedRole of expectedRoles) {
      const role = roles.find(r => r.name === expectedRole);
      if (!role) {
        issues.push(`Missing expected role: ${expectedRole}`);
      } else if (role.rolePermissions.length === 0) {
        issues.push(`Role ${expectedRole} has no permissions assigned`);
      }
    }

    const isValid = issues.length === 0;

    const summary = {
      permissions: permissionCount,
      roles: roleCount,
      platformTenant: hasPlatformTenant,
      superAdminUser: !!hasSuperAdminUser,
    };

    if (isValid) {
      this.logger.log('✅ RBAC system validation passed');
    } else {
      this.logger.warn('⚠️  RBAC system validation found issues:', issues);
    }

    this.logger.log('📊 RBAC System Summary:', summary);

    return { isValid, summary, issues };
  }

  async resetRbacSystem(): Promise<void> {
    this.logger.warn('🔄 Resetting RBAC system (this will delete all role/permission data)...');

    await this.prisma.$transaction(async (tx) => {
      // Delete in correct order to avoid foreign key constraints
      await tx.userRole.deleteMany({});
      await tx.rolePermission.deleteMany({});
      await tx.role.deleteMany({});
      await tx.permission.deleteMany({});
    });

    this.logger.log('✅ RBAC system reset complete');
  }
}
