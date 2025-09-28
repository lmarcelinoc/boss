export { User } from '@prisma/client';
import { User as PrismaUser } from '@prisma/client';

// Additional types for user metadata
export interface UserMetadata {
  suspendedAt?: string;
  suspensionReason?: string;
  suspensionExpiresAt?: string;
  [key: string]: any;
}

// Extend User type with metadata if needed
export interface UserWithMetadata extends PrismaUser {
  metadata?: UserMetadata;
  role?: string;
}
