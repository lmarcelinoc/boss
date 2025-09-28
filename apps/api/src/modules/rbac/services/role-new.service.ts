import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Role, RoleType, Permission, User, UserRole } from '@prisma/client';
import {
  PermissionAction,
  PermissionResource,
  PermissionScope,
} from '../entities/permission.entity';

// Types for extended models with relationships
type RoleWithPermissions = Role & {
  rolePermissions?: Array<{
    permission: Permission;
  }>;
};

type UserWithRoles = User & {
  userRoles?: Array<{
    role: Role;
  }>;
};

export interface CreateRoleDto {
  name: string;
  description?: string;
  level: number;
  type?: RoleType;
  permissionIds?: string[];
}

export interface UpdateRoleDto {
  name?: string;
  description?: string;
  level?: number;
  isActive?: boolean;
}

export interface AssignPermissionsDto {
  permissionIds: string[];
}

export interface AssignUserRoleDto {
  roleId: string;
}

export interface RoleResponseDto {
  id: string;
  name: string;
  description?: string;
  level: number;
  type: RoleType;
  isSystem: boolean;
  isActive: boolean;
  permissions: Array<{
    id: string;
    name: string;
    resource: string;
    action: string;
  }>;
  totalPermissions: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleListResponseDto {
  roles: RoleResponseDto[];
  total: number;
  page: number;
  limit: number;
}

export interface UserRoleResponseDto {
  userId: string;
  roleId: string;
  roleName: string;
  roleLevel: number;
  assignedAt: Date;
}

export interface UserRoleListResponseDto {
  userRoles: UserRoleResponseDto[];
  total: number;
}

@Injectable()
export class RoleService {
  private readonly logger = new Logger(RoleService.name);

  constructor(
    private readonly prisma: PrismaService
  ) {}

  async createRole(createRoleDto: CreateRoleDto): Promise<Role> {
    const { name, description, level, type = RoleType.CUSTOM, permissionIds } = createRoleDto;

    // Check if role already exists
    const existingRole = await this.prisma.role.findUnique({
      where: { name },
    });

    if (existingRole) {
      throw new BadRequestException(
        `Role with name '${name}' already exists`
      );
    }

    // Create the role
    const role = await this.prisma.role.create({
      data: {
        name,
        description,
        level,
        type,
        isSystem: false,
        isActive: true,
      },
    });

    // Assign permissions if provided
    if (permissionIds && permissionIds.length > 0) {
      await this.assignPermissionsToRole(role.id, { permissionIds });
    }

    this.logger.log(`Created role: ${role.name} (level ${role.level})`);
    return role;
  }

  async updateRole(id: string, updateRoleDto: UpdateRoleDto): Promise<Role> {
    const role = await this.getRole(id);

    if (role.isSystem) {
      throw new BadRequestException('Cannot modify system roles');
    }

    // Check if new name conflicts with existing role
    if (updateRoleDto.name && updateRoleDto.name !== role.name) {
      const existingRole = await this.prisma.role.findUnique({
        where: { name: updateRoleDto.name },
      });
      if (existingRole && existingRole.id !== id) {
        throw new BadRequestException(
          `Role with name '${updateRoleDto.name}' already exists`
        );
      }
    }

    const updatedRole = await this.prisma.role.update({
      where: { id },
      data: updateRoleDto,
    });

    this.logger.log(`Updated role: ${updatedRole.name}`);
    return updatedRole;
  }

  async deleteRole(id: string): Promise<void> {
    const role = await this.getRole(id);

    if (role.isSystem) {
      throw new BadRequestException('Cannot delete system roles');
    }

    // Check if role is assigned to any users
    const usersWithRole = await this.prisma.userRole.count({
      where: { roleId: id },
    });

    if (usersWithRole > 0) {
      throw new BadRequestException(
        `Cannot delete role '${role.name}' as it is assigned to ${usersWithRole} user(s)`
      );
    }

    await this.prisma.role.delete({ where: { id } });
    this.logger.log(`Deleted role: ${role.name}`);
  }

  async getRole(id: string): Promise<Role> {
    const role = await this.prisma.role.findUnique({
      where: { id },
    });

    if (!role) {
      throw new NotFoundException(`Role with ID '${id}' not found`);
    }

    return role;
  }

  async getRoleByName(name: string): Promise<Role | null> {
    return this.prisma.role.findUnique({
      where: { name },
    });
  }

  async getAllRoles(
    page: number = 1,
    limit: number = 50,
    level?: number
  ): Promise<RoleListResponseDto> {
    const skip = (page - 1) * limit;
    const where = level !== undefined ? { level } : {};

    const [roles, total] = await Promise.all([
      this.prisma.role.findMany({
        where,
        include: {
          rolePermissions: {
            include: {
              permission: true,
            },
          },
        },
        orderBy: [
          { level: 'asc' },
          { name: 'asc' },
        ],
        skip,
        take: limit,
      }),
      this.prisma.role.count({ where }),
    ]);

    return {
      roles: roles.map(role => this.mapToResponseDto(role as RoleWithPermissions)),
      total,
      page,
      limit,
    };
  }

  async getSystemRoles(): Promise<Role[]> {
    return this.prisma.role.findMany({
      where: { isSystem: true },
      orderBy: { level: 'asc' },
    });
  }

  async getCustomRoles(): Promise<Role[]> {
    return this.prisma.role.findMany({
      where: { isSystem: false },
      orderBy: { name: 'asc' },
    });
  }

  async assignPermissionsToRole(
    roleId: string,
    assignPermissionsDto: AssignPermissionsDto
  ): Promise<Role> {
    const { permissionIds } = assignPermissionsDto;
    const role = await this.getRole(roleId);

    // Verify all permissions exist
    const permissions = await this.prisma.permission.findMany({
      where: { id: { in: permissionIds } },
    });

    if (permissions.length !== permissionIds.length) {
      const foundIds = permissions.map(p => p.id);
      const missingIds = permissionIds.filter(id => !foundIds.includes(id));
      throw new BadRequestException(
        `Some permissions not found: ${missingIds.join(', ')}`
      );
    }

    // Remove existing permissions
    await this.prisma.rolePermission.deleteMany({
      where: { roleId },
    });

    // Add new permissions
    await this.prisma.rolePermission.createMany({
      data: permissionIds.map(permissionId => ({
        roleId,
        permissionId,
      })),
    });

    this.logger.log(
      `Assigned ${permissions.length} permissions to role: ${role.name}`
    );

    return role;
  }

  async removePermissionsFromRole(
    roleId: string,
    permissionIds: string[]
  ): Promise<Role> {
    const role = await this.getRole(roleId);

    await this.prisma.rolePermission.deleteMany({
      where: {
        roleId,
        permissionId: { in: permissionIds },
      },
    });

    this.logger.log(
      `Removed ${permissionIds.length} permissions from role: ${role.name}`
    );

    return role;
  }

  async assignRoleToUser(
    userId: string,
    assignUserRoleDto: AssignUserRoleDto
  ): Promise<void> {
    const { roleId } = assignUserRoleDto;

    // Verify user exists
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID '${userId}' not found`);
    }

    const role = await this.getRole(roleId);

    // Check if user already has this role
    const existingUserRole = await this.prisma.userRole.findUnique({
      where: {
        userId_roleId: {
          userId,
          roleId,
        },
      },
    });

    if (existingUserRole) {
      throw new BadRequestException(`User already has role '${role.name}'`);
    }

    await this.prisma.userRole.create({
      data: {
        userId,
        roleId,
      },
    });

    this.logger.log(`Assigned role '${role.name}' to user: ${user.email}`);
  }

  async removeRoleFromUser(userId: string, roleId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID '${userId}' not found`);
    }

    const role = await this.getRole(roleId);

    await this.prisma.userRole.delete({
      where: {
        userId_roleId: {
          userId,
          roleId,
        },
      },
    });

    this.logger.log(`Removed role '${role.name}' from user: ${user.email}`);
  }

  async getUserRoles(userId: string): Promise<UserRoleListResponseDto> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
      orderBy: { role: { level: 'asc' } },
    });

    return {
      userRoles: userRoles.map(ur => ({
        userId: ur.userId,
        roleId: ur.roleId,
        roleName: ur.role.name,
        roleLevel: ur.role.level,
        assignedAt: ur.createdAt,
      })),
      total: userRoles.length,
    };
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    const permissions = new Set<string>();

    // Collect all permissions from all user roles
    for (const userRole of userRoles) {
      for (const rolePermission of userRole.role.rolePermissions) {
        if (rolePermission.permission) {
          permissions.add(rolePermission.permission.name);
        }
      }
    }

    return Array.from(permissions);
  }

  async checkUserPermission(
    userId: string,
    resource: string,
    action: string
  ): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId);
    const requiredPermission = `${resource}:${action}`;
    const managePermission = `${resource}:manage`;
    
    return userPermissions.includes(requiredPermission) || 
           userPermissions.includes(managePermission);
  }

  async getUserHighestRole(userId: string): Promise<Role | null> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
      orderBy: { role: { level: 'asc' } }, // Lower level = higher authority
    });

    return userRoles.length > 0 ? userRoles[0].role : null;
  }

  private mapToResponseDto(role: RoleWithPermissions): RoleResponseDto {
    const permissions = role.rolePermissions?.map(rp => ({
      id: rp.permission.id,
      name: rp.permission.name,
      resource: rp.permission.resource,
      action: rp.permission.action,
    })) || [];

    return {
      id: role.id,
      name: role.name,
      description: role.description || undefined,
      level: role.level,
      type: role.type,
      isSystem: role.isSystem,
      isActive: role.isActive,
      permissions,
      totalPermissions: permissions.length,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }
}
