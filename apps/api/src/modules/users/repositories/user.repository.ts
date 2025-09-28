import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { User, Prisma } from '@prisma/client';

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find user by email within current tenant
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email }
    });
  }

  /**
   * Find user by ID within current tenant
   */
  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { id },
      include: {
        profile: true,
        userRoles: {
          include: {
            role: true
          }
        }
      }
    });
  }

  /**
   * Find users by role within current tenant
   */
  async findByRole(roleName: string): Promise<User[]> {
    return this.prisma.user.findMany({
      where: {
        userRoles: {
          some: {
            role: {
              name: roleName
            }
          }
        }
      },
      include: {
        profile: true,
        userRoles: {
          include: {
            role: true
          }
        }
      }
    });
  }

  /**
   * Find users by status within current tenant
   */
  async findByStatus(status: string): Promise<User[]> {
    return this.prisma.user.findMany({
      where: { status },
      include: {
        profile: true,
        userRoles: {
          include: {
            role: true
          }
        }
      }
    });
  }

  /**
   * Find active users within current tenant
   */
  async findActive(): Promise<User[]> {
    return this.prisma.user.findMany({
      where: { isActive: true },
      include: {
        profile: true,
        userRoles: {
          include: {
            role: true
          }
        }
      }
    });
  }

  /**
   * Create a new user
   */
  async create(userData: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({
      data: userData,
      include: {
        profile: true,
        userRoles: {
          include: {
            role: true
          }
        }
      }
    });
  }

  /**
   * Update user by ID
   */
  async update(id: string, userData: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: userData,
      include: {
        profile: true,
        userRoles: {
          include: {
            role: true
          }
        }
      }
    });
  }

  /**
   * Delete user by ID (soft delete)
   */
  async softDelete(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { 
        isActive: false,
        updatedAt: new Date()
      }
    });
  }

  /**
   * Count users within current tenant
   */
  async count(where?: Prisma.UserWhereInput): Promise<number> {
    return this.prisma.user.count({ where });
  }

  /**
   * Find many users with pagination
   */
  async findMany(options: {
    skip?: number;
    take?: number;
    where?: Prisma.UserWhereInput;
    orderBy?: Prisma.UserOrderByWithRelationInput;
    include?: Prisma.UserInclude;
  } = {}): Promise<User[]> {
    return this.prisma.user.findMany({
      ...options,
      include: options.include || {
        profile: true,
        userRoles: {
          include: {
            role: true
          }
        }
      }
    });
  }

  /**
   * Update user's last login
   */
  async updateLastLogin(id: string, ipAddress?: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: {
        lastLoginAt: new Date(),
        ...(ipAddress && { lastLoginIp: ipAddress })
      }
    });
  }

  /**
   * Find users for bulk operations (using admin context to bypass tenant scoping)
   */
  async findForBulkOperations(userIds: string[]): Promise<User[]> {
    return this.prisma.withAdminContext(() =>
      this.prisma.user.findMany({
        where: {
          id: { in: userIds }
        },
        include: {
          profile: true,
          userRoles: {
            include: {
              role: true
            }
          }
        }
      })
    );
  }
}