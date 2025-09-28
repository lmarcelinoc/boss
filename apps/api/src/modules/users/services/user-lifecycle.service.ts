import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { User, Prisma } from '@prisma/client';
import { UserRole, UserStatus } from '@app/shared';
import { AuditEventType } from '../../audit/entities/audit-log.entity';
import { EmailService } from '../../email/services/email.service';
import { AuditService } from '../../audit/services/audit.service';
import { UserRepository } from '../repositories/user.repository';

export interface UserLifecycleOptions {
  sendEmailVerification?: boolean;
  sendWelcomeEmail?: boolean;
  auditEvent?: AuditEventType;
}

export interface UserActivationOptions {
  skipEmailVerification?: boolean;
  auditEvent?: AuditEventType;
}

export interface UserSuspensionOptions {
  reason?: string | undefined;
  duration?: number | undefined; // in days, null for indefinite
  auditEvent?: AuditEventType | undefined;
}

export interface UserReactivationOptions {
  auditEvent?: AuditEventType;
}

@Injectable()
export class UserLifecycleService {
  private readonly logger = new Logger(UserLifecycleService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly emailService: EmailService,
    private readonly auditService: AuditService
  ) {}

  /**
   * Register a new user with proper lifecycle management
   */
  async registerUser(
    userData: Prisma.UserCreateInput,
    options: UserLifecycleOptions = {}
  ): Promise<User> {
    const { sendEmailVerification = true, sendWelcomeEmail = false, auditEvent } = options;

    this.logger.log(`Registering new user: ${userData.email}`);

    try {
      // Create the user
      const user = await this.userRepository.create({
        ...userData,
        status: UserStatus.PENDING,
        emailVerified: !sendEmailVerification,
        emailVerificationToken: sendEmailVerification ? this.generateToken() : null,
        emailVerificationTokenExpiresAt: sendEmailVerification ? this.getTokenExpiration() : null,
      });

      // Log the registration
      const auditData: any = {
        eventType: auditEvent || AuditEventType.USER_CREATED,
        userId: user.id,
        description: `User registered: ${user.email}`,
        metadata: { 
          sendEmailVerification, 
          sendWelcomeEmail,
          authProvider: user.authProvider 
        },
      };
      if (user.tenantId) {
        auditData.tenantId = user.tenantId;
      }
      await this.auditService.logEvent(auditData);

      // Send verification email if requested
      if (sendEmailVerification && user.emailVerificationToken) {
        try {
          await this.emailService.sendEmailVerification(user);
          this.logger.log(`Verification email sent to: ${user.email}`);
        } catch (error) {
          this.logger.error(`Failed to send verification email to ${user.email}:`, error);
          // Don't fail the registration if email fails
        }
      }

      // Send welcome email if requested
      if (sendWelcomeEmail) {
        try {
          await this.emailService.sendWelcomeEmail(user);
          this.logger.log(`Welcome email sent to: ${user.email}`);
        } catch (error) {
          this.logger.error(`Failed to send welcome email to ${user.email}:`, error);
          // Don't fail the registration if email fails
        }
      }

      this.logger.log(`Successfully registered user: ${user.id}`);
      return user;

    } catch (error) {
      this.logger.error(`Failed to register user ${userData.email}:`, error);
      throw new BadRequestException('Failed to register user');
    }
  }

  /**
   * Activate a user account
   */
  async activateUser(
    userId: string, 
    options: UserActivationOptions = {}
  ): Promise<User> {
    const { skipEmailVerification = false, auditEvent } = options;

    this.logger.log(`Activating user: ${userId}`);

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.status === UserStatus.ACTIVE) {
      this.logger.warn(`User ${userId} is already active`);
      return user;
    }

    try {
      const updateData: Prisma.UserUpdateInput = {
        status: UserStatus.ACTIVE,
        isActive: true,
        ...(skipEmailVerification && {
          emailVerified: true,
          emailVerificationToken: null,
          emailVerificationTokenExpiresAt: null,
        }),
        updatedAt: new Date(),
      };

      const updatedUser = await this.userRepository.update(userId, updateData);

      // Log the activation
      const auditData: any = {
        eventType: auditEvent || AuditEventType.USER_ACTIVATED,
        userId: user.id,
        description: `User account activated: ${user.email}`,
        metadata: { skipEmailVerification },
      };
      if (user.tenantId) {
        auditData.tenantId = user.tenantId;
      }
      await this.auditService.logEvent(auditData);

      this.logger.log(`Successfully activated user: ${userId}`);
      return updatedUser;

    } catch (error) {
      this.logger.error(`Failed to activate user ${userId}:`, error);
      throw new BadRequestException('Failed to activate user');
    }
  }

  /**
   * Suspend a user account
   */
  async suspendUser(
    userId: string,
    options: UserSuspensionOptions = {}
  ): Promise<User> {
    const { reason, duration, auditEvent } = options;

    this.logger.log(`Suspending user: ${userId}`);

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.status === UserStatus.SUSPENDED) {
      this.logger.warn(`User ${userId} is already suspended`);
      return user;
    }

    try {
      const suspensionExpiresAt = duration 
        ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000)
        : null;

      const metadata = {
        suspendedAt: new Date().toISOString(),
        suspensionReason: reason,
        ...(suspensionExpiresAt && { suspensionExpiresAt: suspensionExpiresAt.toISOString() }),
      };

      const updateData: Prisma.UserUpdateInput = {
        status: UserStatus.SUSPENDED,
        isActive: false,
        metadata: metadata as any,
        updatedAt: new Date(),
      };

      const updatedUser = await this.userRepository.update(userId, updateData);

      // Log the suspension
      const auditData: any = {
        eventType: auditEvent || AuditEventType.USER_SUSPENDED,
        userId: user.id,
        description: `User account suspended: ${user.email}`,
        metadata: { reason, duration, suspensionExpiresAt },
      };
      if (user.tenantId) {
        auditData.tenantId = user.tenantId;
      }
      await this.auditService.logEvent(auditData);

      this.logger.log(`Successfully suspended user: ${userId}`);
      return updatedUser;

    } catch (error) {
      this.logger.error(`Failed to suspend user ${userId}:`, error);
      throw new BadRequestException('Failed to suspend user');
    }
  }

  /**
   * Reactivate a suspended user account
   */
  async reactivateUser(
    userId: string,
    options: UserReactivationOptions = {}
  ): Promise<User> {
    const { auditEvent } = options;

    this.logger.log(`Reactivating user: ${userId}`);

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.status === UserStatus.ACTIVE) {
      this.logger.warn(`User ${userId} is already active`);
      return user;
    }

    try {
      // Clear suspension metadata
      const currentMetadata = (user.metadata as any) || {};
      const {
        suspendedAt,
        suspensionReason,
        suspensionExpiresAt,
        ...cleanMetadata
      } = currentMetadata;

      const updateData: Prisma.UserUpdateInput = {
        status: UserStatus.ACTIVE,
        isActive: true,
        metadata: cleanMetadata as any,
        updatedAt: new Date(),
      };

      const updatedUser = await this.userRepository.update(userId, updateData);

      // Log the reactivation
      const auditData: any = {
        eventType: auditEvent || AuditEventType.USER_REACTIVATED,
        userId: user.id,
        description: `User account reactivated: ${user.email}`,
        metadata: { previousStatus: user.status },
      };
      if (user.tenantId) {
        auditData.tenantId = user.tenantId;
      }
      await this.auditService.logEvent(auditData);

      this.logger.log(`Successfully reactivated user: ${userId}`);
      return updatedUser;

    } catch (error) {
      this.logger.error(`Failed to reactivate user ${userId}:`, error);
      throw new BadRequestException('Failed to reactivate user');
    }
  }

  /**
   * Verify user email address
   */
  async verifyEmail(token: string): Promise<User> {
    this.logger.log(`Verifying email with token: ${token}`);

    const users = await this.userRepository.findMany({
      where: {
        emailVerificationToken: token,
        emailVerificationTokenExpiresAt: {
          gte: new Date(),
        },
      },
      take: 1,
    });

    if (!users.length) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    const currentUser = users[0];

    if (!currentUser) {
      throw new BadRequestException('User not found');
    }

    try {
      const updatedUser = await this.userRepository.update(currentUser.id, {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null,
        emailVerifiedAt: new Date(),
        updatedAt: new Date(),
      });

      // Log the email verification
      const auditData: any = {
        eventType: AuditEventType.EMAIL_VERIFIED,
        userId: currentUser.id,
        description: `Email verified: ${currentUser.email}`,
      };
      if (currentUser.tenantId) {
        auditData.tenantId = currentUser.tenantId;
      }
      await this.auditService.logEvent(auditData);

      this.logger.log(`Successfully verified email for user: ${currentUser.id}`);
      return updatedUser;

    } catch (error) {
      this.logger.error(`Failed to verify email for user ${currentUser.id}:`, error);
      throw new BadRequestException('Failed to verify email');
    }
  }

  /**
   * Generate a random token
   */
  private generateToken(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * Get token expiration date (24 hours from now)
   */
  private getTokenExpiration(): Date {
    return new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  /**
   * Check if user can be activated
   */
  async canActivateUser(userId: string): Promise<boolean> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      return false;
    }

    return user.status === UserStatus.PENDING || user.status === UserStatus.SUSPENDED;
  }

  /**
   * Check if user can be suspended
   */
  async canSuspendUser(userId: string): Promise<boolean> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      return false;
    }

    return user.status === UserStatus.ACTIVE;
  }

  /**
   * Get user lifecycle status
   */
  async getUserLifecycleStatus(userId: string): Promise<{
    status: string;
    canActivate: boolean;
    canSuspend: boolean;
    canReactivate: boolean;
    emailVerified: boolean;
    suspensionExpiry?: Date;
  }> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const metadata = (user.metadata as any) || {};
    const suspensionExpiry = metadata.suspensionExpiresAt 
      ? new Date(metadata.suspensionExpiresAt)
      : undefined;

    return {
      status: user.status,
      canActivate: await this.canActivateUser(userId),
      canSuspend: await this.canSuspendUser(userId),
      canReactivate: user.status === UserStatus.SUSPENDED,
      emailVerified: user.emailVerified,
      suspensionExpiry,
    };
  }

  /**
   * Check and reactivate users with expired suspensions
   */
  async checkAndReactivateExpiredSuspensions(): Promise<{ reactivatedUsers: number }> {
    this.logger.log('Checking for expired user suspensions...');

    try {
      // Find all suspended users
      const suspendedUsers = await this.userRepository.findByStatus(UserStatus.SUSPENDED);
      let reactivatedCount = 0;

      for (const user of suspendedUsers) {
        const metadata = (user.metadata as any) || {};
        const suspensionExpiresAt = metadata.suspensionExpiresAt 
          ? new Date(metadata.suspensionExpiresAt)
          : null;

        // If suspension has expired, reactivate the user
        if (suspensionExpiresAt && suspensionExpiresAt <= new Date()) {
          await this.reactivateUser(user.id, {
            auditEvent: AuditEventType.USER_REACTIVATED
          });
          reactivatedCount++;
        }
      }

      this.logger.log(`Reactivated ${reactivatedCount} users with expired suspensions`);
      return { reactivatedUsers: reactivatedCount };

    } catch (error) {
      this.logger.error('Error checking expired suspensions:', error);
      throw error;
    }
  }

  /**
   * Delete user (soft delete by setting status to DELETED)
   */
  async deleteUser(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Soft delete by setting status to DELETED
    await this.userRepository.update(userId, { 
      status: 'deleted',
      // deletedAt: new Date() // TODO: Add deletedAt field to User model if needed
    });

    // Log the deletion
    const auditData: any = {
      eventType: AuditEventType.USER_DELETED,
      userId: user.id,
      description: `User account deleted: ${user.email}`,
    };
    if (user.tenantId) {
      auditData.tenantId = user.tenantId;
    }
    await this.auditService.logEvent(auditData);

    this.logger.log(`User deleted: ${userId}`);
  }

  /**
   * Get user lifecycle information
   */
  async getUserLifecycleInfo(userId: string): Promise<{
    status: string;
    canActivate: boolean;
    canSuspend: boolean;
    canReactivate: boolean;
    emailVerified: boolean;
    suspensionExpiry?: Date;
  }> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get suspension expiry if user is suspended
    let suspensionExpiry: Date | null = null;
    if (user.status === UserStatus.SUSPENDED) {
      const metadata = (user.metadata as any) || {};
      suspensionExpiry = metadata.suspensionExpiresAt 
        ? new Date(metadata.suspensionExpiresAt)
        : null;
    }

    return {
      status: user.status,
      canActivate: await this.canActivateUser(userId),
      canSuspend: await this.canSuspendUser(userId),
      canReactivate: user.status === UserStatus.SUSPENDED,
      emailVerified: user.emailVerified,
      ...(suspensionExpiry && { suspensionExpiry }),
    };
  }
}