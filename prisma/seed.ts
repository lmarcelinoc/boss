import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create Platform Tenant (ID: 1 for Super Admin)
  const platformTenant = await prisma.tenant.upsert({
    where: { slug: 'platform' },
    update: {},
    create: {
      id: '1',
      name: 'Platform Administration',
      slug: 'platform',
      settings: {
        branding: {
          primaryColor: '#3B82F6',
          logo: null,
          favicon: null,
        },
        features: {
          realTime: true,
          fileUpload: true,
          customDomain: false,
        },
        limits: {
          maxUsers: -1, // unlimited
          maxStorage: -1, // unlimited
          maxApiCalls: -1, // unlimited
        },
      },
      isActive: true,
    },
  });

  // Create Demo Tenant for development
  const demoTenant = await prisma.tenant.upsert({
    where: { slug: 'demo-company' },
    update: {},
    create: {
      name: 'Demo Company',
      slug: 'demo-company',
      settings: {
        branding: {
          primaryColor: '#059669',
          logo: null,
          favicon: null,
        },
        features: {
          realTime: true,
          fileUpload: true,
          customDomain: false,
        },
        limits: {
          maxUsers: 25,
          maxStorage: 10737418240, // 10GB
          maxApiCalls: 100000,
        },
      },
      isActive: true,
    },
  });

  // Create Roles
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'Super Admin' },
    update: {},
    create: {
      name: 'Super Admin',
      description: 'System administrator with all permissions',
      level: 1,
      type: 'SYSTEM',
      isSystem: true,
      isActive: true,
    },
  });

  const ownerRole = await prisma.role.upsert({
    where: { name: 'Owner' },
    update: {},
    create: {
      name: 'Owner',
      description: 'Tenant owner with full access to tenant resources',
      level: 1,
      type: 'SYSTEM',
      isSystem: true,
      isActive: true,
    },
  });

  const adminRole = await prisma.role.upsert({
    where: { name: 'Admin' },
    update: {},
    create: {
      name: 'Admin',
      description: 'Administrator with management permissions',
      level: 2,
      type: 'SYSTEM',
      isSystem: true,
      isActive: true,
    },
  });

  const managerRole = await prisma.role.upsert({
    where: { name: 'Manager' },
    update: {},
    create: {
      name: 'Manager',
      description: 'Team manager with user and team management permissions',
      level: 3,
      type: 'SYSTEM',
      isSystem: true,
      isActive: true,
    },
  });

  const memberRole = await prisma.role.upsert({
    where: { name: 'Member' },
    update: {},
    create: {
      name: 'Member',
      description: 'Regular member with basic operational permissions',
      level: 4,
      type: 'SYSTEM',
      isSystem: true,
      isActive: true,
    },
  });

  const viewerRole = await prisma.role.upsert({
    where: { name: 'Viewer' },
    update: {},
    create: {
      name: 'Viewer',
      description: 'Read-only access to assigned resources',
      level: 5,
      type: 'SYSTEM',
      isSystem: true,
      isActive: true,
    },
  });

  // Create Permissions
  const resources = ['users', 'roles', 'permissions', 'tenants', 'teams', 'sessions', 'billing', 'subscriptions', 'files', 'notifications', 'reports', 'system_settings'];
  const actions = ['create', 'read', 'update', 'delete', 'manage', 'approve', 'reject', 'export', 'import', 'assign', 'revoke'];

  const permissions = [];
  for (const resource of resources) {
    for (const action of actions) {
      const permission = await prisma.permission.upsert({
        where: { name: `${resource}:${action}` },
        update: {},
        create: {
          name: `${resource}:${action}`,
          resource,
          action,
          description: `${action.charAt(0).toUpperCase() + action.slice(1)} ${resource}`,
        },
      });
      permissions.push(permission);
    }
  }

  // Assign all permissions to Super Admin
  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superAdminRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: superAdminRole.id,
        permissionId: permission.id,
      },
    });
  }

  // Assign all permissions except system_settings to Owner
  for (const permission of permissions.filter(p => p.resource !== 'system_settings')) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: ownerRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: ownerRole.id,
        permissionId: permission.id,
      },
    });
  }

  // Create default Super Admin user
  const hashedPassword = await bcrypt.hash('SuperAdmin123!', 12);
  const superAdminUser = await prisma.user.upsert({
    where: { email: 'superadmin@platform.local' },
    update: {},
    create: {
      email: 'superadmin@platform.local',
      firstName: 'Super',
      lastName: 'Admin',
      tenantId: platformTenant.id,
      emailVerifiedAt: new Date(),
      isActive: true,
    },
  });

  // Create user profile for Super Admin
  await prisma.userProfile.upsert({
    where: { userId: superAdminUser.id },
    update: {},
    create: {
      userId: superAdminUser.id,
      timezone: 'UTC',
      locale: 'en-US',
      preferences: {
        theme: 'light',
        notifications: {
          email: true,
          push: false,
          sms: false,
          inApp: true,
        },
      },
    },
  });

  // Assign Super Admin role
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: superAdminUser.id,
        roleId: superAdminRole.id,
      },
    },
    update: {},
    create: {
      userId: superAdminUser.id,
      roleId: superAdminRole.id,
    },
  });

  // Create demo user for development
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@demo.local' },
    update: {},
    create: {
      email: 'demo@demo.local',
      firstName: 'Demo',
      lastName: 'User',
      tenantId: demoTenant.id,
      emailVerifiedAt: new Date(),
      isActive: true,
    },
  });

  // Create user profile for demo user
  await prisma.userProfile.upsert({
    where: { userId: demoUser.id },
    update: {},
    create: {
      userId: demoUser.id,
      timezone: 'UTC',
      locale: 'en-US',
      preferences: {
        theme: 'light',
        notifications: {
          email: true,
          push: false,
          sms: false,
          inApp: true,
        },
      },
    },
  });

  // Assign Owner role to demo user
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: demoUser.id,
        roleId: ownerRole.id,
      },
    },
    update: {},
    create: {
      userId: demoUser.id,
      roleId: ownerRole.id,
    },
  });

  // Create default plans
  const freePlan = await prisma.plan.upsert({
    where: { name: 'Free' },
    update: {},
    create: {
      name: 'Free',
      description: 'Perfect for getting started',
      price: 0,
      currency: 'USD',
      interval: 'MONTH',
      intervalCount: 1,
      features: [
        'Up to 5 users',
        '1GB storage',
        'Basic support',
        'Core features',
      ],
      limits: {
        users: 5,
        storage: 1073741824, // 1GB
        apiCalls: 10000,
      },
      isActive: true,
    },
  });

  const proPlan = await prisma.plan.upsert({
    where: { name: 'Pro' },
    update: {},
    create: {
      name: 'Pro',
      description: 'For growing teams',
      price: 2900, // $29.00
      currency: 'USD',
      interval: 'MONTH',
      intervalCount: 1,
      features: [
        'Up to 25 users',
        '10GB storage',
        'Priority support',
        'Advanced features',
        'Integrations',
      ],
      limits: {
        users: 25,
        storage: 10737418240, // 10GB
        apiCalls: 100000,
      },
      isActive: true,
    },
  });

  const enterprisePlan = await prisma.plan.upsert({
    where: { name: 'Enterprise' },
    update: {},
    create: {
      name: 'Enterprise',
      description: 'For large organizations',
      price: 9900, // $99.00
      currency: 'USD',
      interval: 'MONTH',
      intervalCount: 1,
      features: [
        'Unlimited users',
        '100GB storage',
        '24/7 dedicated support',
        'All features',
        'Custom integrations',
        'SSO',
        'Advanced security',
      ],
      limits: {
        users: -1, // unlimited
        storage: 107374182400, // 100GB
        apiCalls: 1000000,
      },
      isActive: true,
    },
  });

  // Create a subscription for the demo tenant
  await prisma.subscription.upsert({
    where: { tenantId: demoTenant.id },
    update: {},
    create: {
      tenantId: demoTenant.id,
      planId: freePlan.id,
      status: 'ACTIVE',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      cancelAtPeriodEnd: false,
    },
  });

  console.log('✅ Database seeded successfully!');
  console.log(`
🎯 Created:
  - Platform tenant: ${platformTenant.name} (${platformTenant.slug})
  - Demo tenant: ${demoTenant.name} (${demoTenant.slug})
  - Super Admin user: ${superAdminUser.email}
  - Demo user: ${demoUser.email}
  - ${permissions.length} permissions
  - 6 roles with proper permissions
  - 3 subscription plans

🔑 Login credentials:
  Super Admin: superadmin@platform.local / SuperAdmin123!
  Demo User: demo@demo.local / (use Supabase Auth or set password)

🚀 Next steps:
  1. Run the NestJS API server
  2. Access the admin dashboard
  3. Create additional users and tenants as needed
  `);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
