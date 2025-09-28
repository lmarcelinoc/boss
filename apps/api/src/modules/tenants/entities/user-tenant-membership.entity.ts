// Temporary interface to resolve compilation errors
// TODO: Refactor to use proper Prisma User-Tenant relationships

import { User } from '@prisma/client';
import { UserRole, MembershipStatus } from '@app/shared';

export interface UserTenantMembership {
  id: string;
  userId: string;
  tenantId: string;
  role: UserRole;
  status: MembershipStatus;
  joinedAt: Date;
  lastAccessedAt?: Date;
  expiresAt?: Date;
  isActive: boolean;
  isExpired: boolean;
  permissions?: Array<{ getFullName(): string }>;
  tenant: {
    id: string;
    name: string;
    domain?: string;
    plan: string;
    features?: string[];
    settings?: Record<string, any>;
  };
  
  // Methods expected by the service
  updateLastAccessed(): void;
}

// Mock implementation for repository injection
export class UserTenantMembership {
  id!: string;
  userId!: string;
  tenantId!: string;
  role!: UserRole;
  status!: MembershipStatus;
  joinedAt!: Date;
  lastAccessedAt?: Date;
  expiresAt?: Date;
  isActive!: boolean;
  isExpired!: boolean;
  permissions?: Array<{ getFullName(): string }>;
  tenant!: {
    id: string;
    name: string;
    domain?: string;
    plan: string;
    features?: string[];
    settings?: Record<string, any>;
  };

  updateLastAccessed(): void {
    this.lastAccessedAt = new Date();
  }
}
