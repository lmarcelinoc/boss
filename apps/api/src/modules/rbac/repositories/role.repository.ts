import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/services/prisma.service';
import { Role, RoleType, Prisma } from '@prisma/client';
import { BaseTenantScopedRepository } from '../../../common/repositories/base-tenant-scoped.repository';

@Injectable()
export class RoleRepository extends BaseTenantScopedRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  /**
   * Find role by name
   */
  async findByName(name: string): Promise<Role | null> {
    return this.prisma.role.findFirst({
      where: { name },
      include: {
        rolePermissions: {
          include: {
            permission: true
          }
        }
      }
    });
  }

  /**
   * Find role by ID
   */
  async findById(id: string): Promise<Role | null> {
    return this.prisma.role.findUnique({
      where: { id },
      include: {
        rolePermissions: {
          include: {
            permission: true
          }
        },
        userRoles: {
          include: {
            user: true
          }
        }
      }
    });
  }

  /**
   * Find system roles
   */
  async findSystemRoles(): Promise<Role[]> {
    return this.prisma.role.findMany({
      where: { 
        isSystem: true,
        isActive: true
      },
      include: {
        rolePermissions: {
          include: {
            permission: true
          }
        }
      },
      orderBy: { level: 'asc' }
    });
  }

  /**
   * Find roles by type
   */
  async findByType(type: RoleType): Promise<Role[]> {
    return this.prisma.role.findMany({
      where: { 
        type,
        isActive: true
      },
      include: {
        rolePermissions: {
          include: {
            permission: true
          }
        }
      },
      orderBy: { level: 'asc' }
    });
  }

  /**
   * Find roles by level
   */
  async findByLevel(level: number): Promise<Role[]> {
    return this.prisma.role.findMany({
      where: { 
        level,
        isActive: true
      },
      include: {
        rolePermissions: {
          include: {
            permission: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });
  }

  /**
   * Find active roles
   */
  async findActive(): Promise<Role[]> {
    return this.prisma.role.findMany({
      where: { isActive: true },
      include: {
        rolePermissions: {
          include: {
            permission: true
          }
        }
      },
      orderBy: [
        { level: 'asc' },
        { name: 'asc' }
      ]
    });
  }

  /**
   * Create a new role
   */
  async create(roleData: Prisma.RoleCreateInput): Promise<Role> {
    this.logTenantOperation('CREATE', 'Role');
    return this.prisma.role.create({
      data: roleData,
      include: {
        rolePermissions: {
          include: {
            permission: true
          }
        }
      }
    });
  }

  /**
   * Update role
   */
  async update(id: string, roleData: Prisma.RoleUpdateInput): Promise<Role> {
    this.logTenantOperation('UPDATE', 'Role', id);
    return this.prisma.role.update({
      where: { id },
      data: roleData,
      include: {
        rolePermissions: {
          include: {
            permission: true
          }
        }
      }
    });
  }

  /**
   * Delete role (soft delete)
   */
  async softDelete(id: string): Promise<Role> {
    this.logTenantOperation('DELETE', 'Role', id);
    return this.prisma.role.update({
      where: { id },
      data: { 
        isActive: false,
        updatedAt: new Date()
      }
    });
  }

  /**
   * Find roles with permissions
   */
  async findWithPermissions(): Promise<Role[]> {
    return this.prisma.role.findMany({
      where: { isActive: true },
      include: {
        rolePermissions: {
          include: {
            permission: true
          }
        }
      },
      orderBy: [
        { level: 'asc' },
        { name: 'asc' }
      ]
    });
  }

  /**
   * Find roles for user
   */
  async findForUser(userId: string): Promise<Role[]> {
    return this.prisma.role.findMany({
      where: {
        userRoles: {
          some: {
            userId
          }
        },
        isActive: true
      },
      include: {
        rolePermissions: {
          include: {
            permission: true
          }
        }
      },
      orderBy: { level: 'asc' }
    });
  }

  /**
   * Count roles
   */
  async count(where?: Prisma.RoleWhereInput): Promise<number> {
    return this.prisma.role.count({
      where: {
        ...where,
        isActive: true
      }
    });
  }

  /**
   * Find many with pagination
   */
  async findMany(options: {
    skip?: number;
    take?: number;
    where?: Prisma.RoleWhereInput;
    orderBy?: Prisma.RoleOrderByWithRelationInput;
    include?: Prisma.RoleInclude;
  } = {}): Promise<Role[]> {
    return this.prisma.role.findMany({
      ...options,
      where: {
        ...options.where,
        isActive: true
      },
      include: options.include || {
        rolePermissions: {
          include: {
            permission: true
          }
        }
      }
    });
  }
}