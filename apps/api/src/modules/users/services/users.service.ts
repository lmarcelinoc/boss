import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserQueryDto } from '../dto/user-query.dto';
import { User } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto, tenantId: string): Promise<User> {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        email: createUserDto.email,
        tenantId,
      },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    return this.prisma.user.create({
      data: {
        ...createUserDto,
        tenantId,
      },
    });
  }

  async findAll(
    query: UserQueryDto,
    tenantId: string
  ): Promise<{ users: User[]; total: number }> {
    const { page = 1, limit = 10, search } = query;
    const skip = (page - 1) * limit;

    const where = {
      tenantId,
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' as any } },
          { lastName: { contains: search, mode: 'insensitive' as any } },
          { email: { contains: search, mode: 'insensitive' as any } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        include: { userRoles: { include: { role: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  async findOne(id: string, tenantId: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      include: { 
        userRoles: { include: { role: true } },
        tenant: true 
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findByEmail(email: string, tenantId: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email, tenantId },
    });
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    tenantId: string
  ): Promise<User> {
    const user = await this.findOne(id, tenantId);

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.findByEmail(
        updateUserDto.email,
        tenantId
      );
      if (existingUser && existingUser.id !== id) {
        throw new ConflictException('User with this email already exists');
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: updateUserDto,
    });
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.findOne(id, tenantId); // Ensure user exists and belongs to tenant
    await this.prisma.user.delete({
      where: { id },
    });
  }

  async activate(id: string, tenantId: string): Promise<User> {
    await this.findOne(id, tenantId); // Ensure user exists and belongs to tenant
    return this.prisma.user.update({
      where: { id },
      data: { isActive: true },
    });
  }

  async deactivate(id: string, tenantId: string): Promise<User> {
    await this.findOne(id, tenantId); // Ensure user exists and belongs to tenant
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
