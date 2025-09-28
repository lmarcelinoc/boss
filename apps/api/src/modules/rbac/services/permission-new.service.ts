import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Permission } from '@prisma/client';
import {
  PermissionAction,
  PermissionResource,
  PermissionScope,
} from '../entities/permission.entity';

export interface CreatePermissionDto {
  name: string;
  description?: string;
  resource: PermissionResource;
  action: PermissionAction;
  scope?: PermissionScope;
}

export interface UpdatePermissionDto {
  name?: string;
  description?: string;
  resource?: PermissionResource;
  action?: PermissionAction;
}

export interface PermissionResponseDto {
  id: string;
  name: string;
  description?: string;
  resource: string;
  action: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PermissionListResponseDto {
  permissions: PermissionResponseDto[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  constructor(
    private readonly prisma: PrismaService
  ) {}

  async createPermission(
    createPermissionDto: CreatePermissionDto
  ): Promise<Permission> {
    const { name, description, resource, action } = createPermissionDto;

    // Check if permission already exists
    const existingPermission = await this.prisma.permission.findUnique({
      where: { name },
    });

    if (existingPermission) {
      throw new BadRequestException(
        `Permission with name '${name}' already exists`
      );
    }

    const permission = await this.prisma.permission.create({
      data: {
        name,
        description,
        resource,
        action,
      },
    });

    this.logger.log(`Created permission: ${permission.name}`);
    return permission;
  }

  async updatePermission(
    id: string,
    updatePermissionDto: UpdatePermissionDto
  ): Promise<Permission> {
    const permission = await this.getPermission(id);

    const updatedPermission = await this.prisma.permission.update({
      where: { id },
      data: updatePermissionDto,
    });

    this.logger.log(`Updated permission: ${updatedPermission.name}`);
    return updatedPermission;
  }

  async deletePermission(id: string): Promise<void> {
    const permission = await this.getPermission(id);

    await this.prisma.permission.delete({ where: { id } });
    this.logger.log(`Deleted permission: ${permission.name}`);
  }

  async getPermission(id: string): Promise<Permission> {
    const permission = await this.prisma.permission.findUnique({
      where: { id },
    });

    if (!permission) {
      throw new NotFoundException(`Permission with ID '${id}' not found`);
    }

    return permission;
  }

  async getPermissionByName(name: string): Promise<Permission | null> {
    return this.prisma.permission.findUnique({
      where: { name },
    });
  }

  async getAllPermissions(
    page: number = 1,
    limit: number = 50,
    resource?: PermissionResource
  ): Promise<PermissionListResponseDto> {
    const skip = (page - 1) * limit;
    const where = resource ? { resource } : {};

    const [permissions, total] = await Promise.all([
      this.prisma.permission.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.permission.count({ where }),
    ]);

    return {
      permissions: permissions.map(this.mapToResponseDto),
      total,
      page,
      limit,
    };
  }

  async getPermissionsByIds(ids: string[]): Promise<Permission[]> {
    return this.prisma.permission.findMany({
      where: { id: { in: ids } },
    });
  }

  async getPermissionsByResource(
    resource: PermissionResource
  ): Promise<Permission[]> {
    return this.prisma.permission.findMany({
      where: { resource },
      orderBy: { action: 'asc' },
    });
  }

  async createDefaultPermissions(): Promise<void> {
    const defaultPermissions = this.generateDefaultPermissions();

    for (const permissionData of defaultPermissions) {
      const existingPermission = await this.getPermissionByName(
        permissionData.name!
      );

      if (!existingPermission) {
        await this.prisma.permission.create({
          data: permissionData,
        });
        
        this.logger.log(`Created default permission: ${permissionData.name}`);
      }
    }

    this.logger.log('Default permissions creation completed');
  }

  private generateDefaultPermissions(): Array<{
    name: string;
    description: string;
    resource: string;
    action: string;
  }> {
    const permissions: Array<{
      name: string;
      description: string;
      resource: string;
      action: string;
    }> = [];

    // User Management Permissions
    Object.values(PermissionAction).forEach(action => {
      permissions.push({
        name: `users:${action}`,
        description: `Can ${action} users`,
        resource: PermissionResource.USERS,
        action: action as PermissionAction,
      });
    });

    // Role Management Permissions
    Object.values(PermissionAction).forEach(action => {
      permissions.push({
        name: `roles:${action}`,
        description: `Can ${action} roles`,
        resource: PermissionResource.ROLES,
        action: action as PermissionAction,
      });
    });

    // Permission Management Permissions
    Object.values(PermissionAction).forEach(action => {
      permissions.push({
        name: `permissions:${action}`,
        description: `Can ${action} permissions`,
        resource: PermissionResource.PERMISSIONS,
        action: action as PermissionAction,
      });
    });

    // Tenant Management Permissions
    Object.values(PermissionAction).forEach(action => {
      permissions.push({
        name: `tenants:${action}`,
        description: `Can ${action} tenants`,
        resource: PermissionResource.TENANTS,
        action: action as PermissionAction,
      });
    });

    // Team Management Permissions
    Object.values(PermissionAction).forEach(action => {
      permissions.push({
        name: `teams:${action}`,
        description: `Can ${action} teams`,
        resource: PermissionResource.TEAMS,
        action: action as PermissionAction,
      });
    });

    // Session Management Permissions
    Object.values(PermissionAction).forEach(action => {
      permissions.push({
        name: `sessions:${action}`,
        description: `Can ${action} sessions`,
        resource: PermissionResource.SESSIONS,
        action: action as PermissionAction,
      });
    });

    // Billing Permissions
    Object.values(PermissionAction).forEach(action => {
      permissions.push({
        name: `billing:${action}`,
        description: `Can ${action} billing`,
        resource: PermissionResource.BILLING,
        action: action as PermissionAction,
      });
    });

    // Subscription Permissions
    Object.values(PermissionAction).forEach(action => {
      permissions.push({
        name: `subscriptions:${action}`,
        description: `Can ${action} subscriptions`,
        resource: PermissionResource.SUBSCRIPTIONS,
        action: action as PermissionAction,
      });
    });

    // File Management Permissions
    Object.values(PermissionAction).forEach(action => {
      permissions.push({
        name: `files:${action}`,
        description: `Can ${action} files`,
        resource: PermissionResource.FILES,
        action: action as PermissionAction,
      });
    });

    // Notification Permissions
    Object.values(PermissionAction).forEach(action => {
      permissions.push({
        name: `notifications:${action}`,
        description: `Can ${action} notifications`,
        resource: PermissionResource.NOTIFICATIONS,
        action: action as PermissionAction,
      });
    });

    // Reports and Analytics Permissions
    Object.values(PermissionAction).forEach(action => {
      permissions.push({
        name: `reports:${action}`,
        description: `Can ${action} reports`,
        resource: PermissionResource.REPORTS,
        action: action as PermissionAction,
      });
    });

    // System Settings Permissions (Global scope)
    Object.values(PermissionAction).forEach(action => {
      permissions.push({
        name: `system_settings:${action}`,
        description: `Can ${action} system settings`,
        resource: PermissionResource.SYSTEM_SETTINGS,
        action: action as PermissionAction,
      });
    });

    return permissions;
  }

  private mapToResponseDto(permission: Permission): PermissionResponseDto {
    return {
      id: permission.id,
      name: permission.name,
      description: permission.description || undefined,
      resource: permission.resource,
      action: permission.action,
      createdAt: permission.createdAt,
      updatedAt: permission.updatedAt,
    };
  }

  async validatePermission(
    resource: string,
    action: string
  ): Promise<boolean> {
    const permission = await this.prisma.permission.findFirst({
      where: {
        resource: resource as PermissionResource,
        action: action as PermissionAction,
      },
    });

    return !!permission;
  }

  async getPermissionResources(): Promise<PermissionResource[]> {
    return Object.values(PermissionResource);
  }

  async getPermissionActions(): Promise<PermissionAction[]> {
    return Object.values(PermissionAction);
  }
}
