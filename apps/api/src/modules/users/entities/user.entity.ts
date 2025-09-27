export { User } from '@prisma/client';

// Additional types for user metadata
export interface UserMetadata {
  suspendedAt?: string;
  suspensionReason?: string;
  suspensionExpiresAt?: string;
  [key: string]: any;
}

// Extend User type with metadata if needed
export interface UserWithMetadata extends User {
  metadata?: UserMetadata;
  role?: string;
}
