import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { User, Tenant } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { JwtService } from './jwt.service';
import { RefreshTokenService } from './refresh-token.service';
import { MfaService } from './mfa.service';
import { EmailService } from '../../email/services/email.service';
import { SessionService } from './session.service';
import { RoleService } from '../../rbac/services/role.service';
import { PermissionService } from '../../rbac/services/permission.service';
import { PrismaAuditService } from '../../audit/services/prisma-audit.service';
import { LoginDto, RegisterDto } from '../dto';
import {
  LoginResponse,
  LoginRequest,
  AuthProvider,
  UserStatus,
  UserRole,
  JwtPayload,
  RefreshTokenPayload,
} from '@app/shared';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly mfaService: MfaService,
    private readonly emailService: EmailService,
    private readonly sessionService: SessionService,
    private readonly roleService: RoleService,
    private readonly permissionService: PermissionService,
    private readonly auditService: PrismaAuditService
  ) {}

  /**
   * Register a new user
   */
  async register(registerDto: RegisterDto): Promise<LoginResponse> {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new BadRequestException('User already exists');
    }

    // Hash password before storing
    const hashedPassword = await argon2.hash(registerDto.password);

    // On first login, we'll create tenant. For now, user is created without tenant
    // per PRD requirements for deferred tenant creation
    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        password: hashedPassword,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        authProvider: AuthProvider.LOCAL,
        status: UserStatus.PENDING, // Email verification required
      },
    });

    // Create default permissions and roles for the tenant if they don't exist
    await this.permissionService.createDefaultPermissions();
    await this.roleService.createDefaultRoles();

    // Log user registration
    await this.auditService.logUserRegistration(
      user.id,
      user.email,
      user.tenantId || undefined,
      undefined, // No request object available here
      {
        firstName: user.firstName,
        lastName: user.lastName,
        authProvider: AuthProvider.LOCAL,
      }
    ).catch(error => {
      this.logger.warn(`Failed to log user registration: ${error.message}`);
    });

    // Send email verification
    await this.emailService.sendEmailVerification(user);

    // Generate tokens - tenant will be created on first login
    const accessToken = this.jwtService.generateAccessToken({
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId || 'pending', // Will be set on first login
      role: UserRole.MEMBER, // Default role until tenant is created
    });

    const refreshTokenEntity =
      await this.refreshTokenService.createRefreshToken(user, {});
    const refreshToken = this.jwtService.generateRefreshToken(
      user.id,
      refreshTokenEntity.tokenId
    );
    const tokenHash = this.refreshTokenService.hashToken(refreshToken);
    await this.refreshTokenService.updateTokenHash(
      refreshTokenEntity.tokenId,
      tokenHash
    );

    // Calculate expiration time
    const expiresIn = this.jwtService.getTokenExpiration(accessToken)?.getTime()
      ? Math.floor(
          (this.jwtService.getTokenExpiration(accessToken)!.getTime() -
            Date.now()) /
            1000
        )
      : 0;

    return {
      accessToken,
      refreshToken,
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: UserRole.MEMBER,
        status: this.mapStatusToEnum(user.status),
        tenantId: user.tenantId || 'pending',
        ...(user.avatar && { avatar: user.avatar }),
      },
    };
  }

  /**
   * Login user
   */
  async login(
    loginDto: LoginDto,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
      include: { tenant: true },
    });

    if (!user) {
      // Log failed login attempt for non-existent user
      await this.auditService.logLoginFailed(
        loginDto.email,
        'User not found',
        undefined, // No request object available here
        {
          ipAddress,
          userAgent: userAgent || 'Unknown',
        }
      ).catch(error => {
        this.logger.warn(`Failed to log login attempt: ${error.message}`);
      });

      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await argon2.verify(user.password, loginDto.password);
    if (!isPasswordValid) {
      // Log failed login attempt for wrong password
      await this.auditService.logLoginFailed(
        loginDto.email,
        'Invalid password',
        undefined, // No request object available here
        {
          userId: user.id,
          ipAddress,
          userAgent: userAgent || 'Unknown',
        }
      ).catch(error => {
        this.logger.warn(`Failed to log login attempt: ${error.message}`);
      });

      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is active
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    // PRD Requirement: Deferred tenant creation on first login
    if (!user.tenantId) {
      this.logger.log(`Creating tenant for user on first login: ${user.email}`);
      const tenant = await this.prisma.tenant.create({
        data: {
          name: `${user.firstName}'s Organization`,
          slug: `${user.email.split('@')[0]}-${Date.now()}`, // Unique slug
          domain: `${user.email.split('@')[0]}-${Date.now()}.example.com`, // Unique domain
          isActive: true,
        },
      });

      // Update user with tenant and owner role
      const updateData: any = {
        tenantId: tenant.id,
        lastLoginAt: new Date(),
      };
      if (ipAddress) {
        updateData.lastLoginIp = ipAddress;
      }
      const updatedUser = await this.prisma.user.update({
        where: { id: user.id },
        data: updateData,
        include: { tenant: true },
      });

      // Assign Owner role to the user
      const ownerRole = await this.roleService.getRoleByName('Owner');
      if (ownerRole) {
        await this.roleService.assignRoleToUser(user.id, {
          roleId: ownerRole.id,
        });
        this.logger.log(`Assigned Owner role to user: ${user.email}`);
      }

      user.tenantId = tenant.id;
      user.tenant = tenant;
    } else {
      // Update last login for existing tenant users
      const updateData: any = {
        lastLoginAt: new Date(),
      };
      if (ipAddress) {
        updateData.lastLoginIp = ipAddress;
      }
      await this.prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });
    }

    // Get user's current role in the tenant
    const userRole = await this.getUserRole(user.id, user.tenantId!);

    // Generate tokens
    const accessToken = this.jwtService.generateAccessToken({
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId!,
      role: userRole,
    });

    const refreshTokenEntity =
      await this.refreshTokenService.createRefreshToken(user, {
        ...(ipAddress && { ipAddress }),
      });

    const refreshToken = this.jwtService.generateRefreshToken(
      user.id,
      refreshTokenEntity.tokenId
    );
    const tokenHash = this.refreshTokenService.hashToken(refreshToken);
    await this.refreshTokenService.updateTokenHash(
      refreshTokenEntity.tokenId,
      tokenHash
    );

    // Create session for this login
    const deviceFingerprint = this.sessionService.generateDeviceFingerprint(
      userAgent || '',
      ipAddress || ''
    );

    const browserInfo = userAgent
      ? this.sessionService.parseBrowserInfo(userAgent)
      : { browser: 'Unknown', browserVersion: 'Unknown' };

    const osInfo = userAgent
      ? this.sessionService.parseOperatingSystem(userAgent)
      : { operatingSystem: 'Unknown', osVersion: 'Unknown' };

    const deviceType = userAgent
      ? this.sessionService.detectDeviceType(userAgent)
      : ('unknown' as any);

    const session = await this.sessionService.createSession({
      userId: user.id,
      refreshTokenHash: tokenHash,
      deviceFingerprint,
      deviceName: `${browserInfo.browser} on ${osInfo.operatingSystem}`,
      deviceType,
      browser: browserInfo.browser,
      browserVersion: browserInfo.browserVersion,
      operatingSystem: osInfo.operatingSystem,
      osVersion: osInfo.osVersion,
      ipAddress: ipAddress || 'unknown',
      userAgent: userAgent || '',
      isRememberMe: loginDto.rememberMe || false,
    });

    // Log successful login
    await this.auditService.logUserLogin(
      user.id,
      user.email,
      user.tenantId!,
      undefined, // No request object available here
      {
        userAgent: userAgent || 'Unknown',
        deviceType,
        browser: browserInfo.browser,
        operatingSystem: osInfo.operatingSystem,
        sessionId: session.id,
      }
    ).catch(error => {
      this.logger.warn(`Failed to log user login: ${error.message}`);
    });

    // Calculate expiration time
    const expiresIn = this.jwtService.getTokenExpiration(accessToken)?.getTime()
      ? Math.floor(
          (this.jwtService.getTokenExpiration(accessToken)!.getTime() -
            Date.now()) /
            1000
        )
      : 0;

    return {
      accessToken,
      refreshToken,
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: userRole,
        status: user.status,
        tenantId: user.tenantId!,
        ...(user.avatar && { avatar: user.avatar }),
      },
    };
  }

  /**
   * Verify MFA and complete login
   */
  async verifyMfaAndCompleteLogin(
    userId: string,
    token: string
  ): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    // Check if user has exceeded attempt limits
    if (this.mfaService.hasExceededAttempts(user)) {
      throw new UnauthorizedException(
        'Too many failed attempts. Please try again later.'
      );
    }

    // Verify MFA token
    const isValid = await this.mfaService.verifyTwoFactorAuth(user, token);
    if (!isValid) {
      throw new UnauthorizedException('Invalid verification code');
    }

    // Reset attempt counter
    await this.mfaService.resetAttempts(user);

    // Get user's current role in the tenant
    const userRole = await this.getUserRole(user.id, user.tenantId!);

    // Generate tokens
    const accessToken = this.jwtService.generateAccessToken({
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId!,
      role: userRole,
    });

    const refreshTokenEntity =
      await this.refreshTokenService.createRefreshToken(user, {});
    const refreshToken = this.jwtService.generateRefreshToken(
      user.id,
      refreshTokenEntity.tokenId
    );
    const tokenHash = this.refreshTokenService.hashToken(refreshToken);
    await this.refreshTokenService.updateTokenHash(
      refreshTokenEntity.tokenId,
      tokenHash
    );

    // Calculate expiration time
    const expiresIn = this.jwtService.getTokenExpiration(accessToken)?.getTime()
      ? Math.floor(
          (this.jwtService.getTokenExpiration(accessToken)!.getTime() -
            Date.now()) /
            1000
        )
      : 0;

    return {
      accessToken,
      refreshToken,
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: userRole,
        status: this.mapStatusToEnum(user.status),
        tenantId: user.tenantId!,
        ...(user.avatar && { avatar: user.avatar }),
      },
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(
    refreshToken: string,
    ipAddress?: string
  ): Promise<LoginResponse> {
    const payload = this.jwtService.decodeToken(refreshToken);
    if (!payload) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { tenant: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Validate refresh token
    const isValid =
      await this.refreshTokenService.validateRefreshToken(refreshToken);
    if (!isValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Rotate refresh token
    const { newToken: newRefreshTokenEntity } =
      await this.refreshTokenService.rotateRefreshToken(refreshToken, user, {
        ...(ipAddress && { ipAddress }),
      });

    // Generate new refresh token JWT
    const newRefreshToken = this.jwtService.generateRefreshToken(
      user.id,
      newRefreshTokenEntity.tokenId
    );
    const tokenHash = this.refreshTokenService.hashToken(newRefreshToken);
    await this.refreshTokenService.updateTokenHash(
      newRefreshTokenEntity.tokenId,
      tokenHash
    );

    // Get user's current role in the tenant
    const userRole = await this.getUserRole(user.id, user.tenantId!);

    // Generate new access token
    const accessToken = this.jwtService.generateAccessToken({
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId!,
      role: userRole,
    });

    // Calculate expiration time
    const expiresIn = this.jwtService.getTokenExpiration(accessToken)?.getTime()
      ? Math.floor(
          (this.jwtService.getTokenExpiration(accessToken)!.getTime() -
            Date.now()) /
            1000
        )
      : 0;

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: userRole,
        status: this.mapStatusToEnum(user.status),
        tenantId: user.tenantId!,
        ...(user.avatar && { avatar: user.avatar }),
      },
    };
  }

  /**
   * Logout user
   */
  async logout(refreshToken: string, userId?: string): Promise<void> {
    const payload = this.jwtService.decodeToken(refreshToken);
    if (payload) {
      await this.refreshTokenService.revokeRefreshToken(payload.tokenId);
    }

    // If userId is provided, revoke the current session
    if (userId) {
      // Find and revoke the session associated with this refresh token
      const sessions = await this.sessionService.getUserSessions(userId);
      const currentSession = sessions.find(
        session =>
          session.refreshTokenHash ===
          this.refreshTokenService.hashToken(refreshToken)
      );

      if (currentSession) {
        await this.sessionService.revokeSession(currentSession.id, {
          reason: 'User logout',
        });
      }
    }
  }

  /**
   * Get user profile
   */
  async getProfile(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  /**
   * Verify email
   */
  async verifyEmail(token: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { emailVerificationToken: token },
    });

    if (!user) {
      throw new BadRequestException('Invalid verification token');
    }

    if (!user.emailVerificationTokenExpiresAt || user.emailVerificationTokenExpiresAt < new Date()) {
      throw new BadRequestException('Verification token has expired');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null,
        status: UserStatus.ACTIVE,
      },
    });
  }

  /**
   * Resend email verification
   */
  async resendEmailVerification(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // Generate new verification token
    const verificationToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiration

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: verificationToken,
        emailVerificationTokenExpiresAt: expiresAt,
      },
    });

    await this.emailService.sendEmailVerification(updatedUser);
  }

  /**
   * Forgot password
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    this.logger.log(`Password reset requested for email: ${email}`);

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal if user exists for security
      this.logger.warn(
        `Password reset attempted for non-existent email: ${email}`
      );
      return {
        message: 'Password reset email sent',
      };
    }

    // Check if user is active
    if (user.status !== UserStatus.ACTIVE) {
      this.logger.warn(`Password reset attempted for inactive user: ${email}`);
      return {
        message: 'Password reset email sent',
      };
    }

    // Generate new reset token
    const resetToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiration

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetTokenExpiresAt: expiresAt,
      },
    });

    try {
      await this.emailService.sendPasswordReset(updatedUser);
      this.logger.log(`Password reset email sent successfully to: ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email to: ${email}`,
        error instanceof Error ? error.stack : String(error)
      );
      // Clear the token if email fails
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: null,
          passwordResetTokenExpiresAt: null,
        },
      });
      throw new BadRequestException('Failed to send password reset email');
    }

    return {
      message: 'Password reset email sent',
    };
  }

  /**
   * Reset password
   */
  async resetPassword(
    token: string,
    newPassword: string
  ): Promise<{ message: string; status: string }> {
    this.logger.log(
      `Password reset attempt with token: ${token.substring(0, 8)}...`
    );

    const user = await this.prisma.user.findFirst({
      where: { passwordResetToken: token },
    });

    if (!user) {
      this.logger.warn(
        `Invalid password reset token attempted: ${token.substring(0, 8)}...`
      );
      throw new BadRequestException('Invalid reset token');
    }

    if (!user.passwordResetTokenExpiresAt || user.passwordResetTokenExpiresAt < new Date()) {
      this.logger.warn(
        `Expired password reset token attempted for user: ${user.email}`
      );
      throw new BadRequestException('Reset token has expired');
    }

    // Check if user is active
    if (user.status !== UserStatus.ACTIVE) {
      this.logger.warn(
        `Password reset attempted for inactive user: ${user.email}`
      );
      throw new BadRequestException('Account is not active');
    }

    // Hash new password and clear reset token
    const hashedPassword = await argon2.hash(newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetTokenExpiresAt: null,
      },
    });

    this.logger.log(`Password reset successful for user: ${user.email}`);

    return {
      message: 'Password reset successfully',
      status: 'success',
    };
  }

  /**
   * Map database status string to UserStatus enum
   */
  private mapStatusToEnum(status: string): UserStatus {
    const statusMapping: Record<string, UserStatus> = {
      'active': UserStatus.ACTIVE,
      'pending': UserStatus.PENDING,
      'suspended': UserStatus.SUSPENDED,
      'deleted': UserStatus.DELETED,
    };
    return statusMapping[status] || UserStatus.PENDING;
  }

  /**
   * Get user's role in a tenant
   */
  private async getUserRole(userId: string, tenantId: string): Promise<UserRole> {
    const userRole = await this.prisma.userRole.findFirst({
      where: {
        userId,
      },
      include: {
        role: true,
      },
    });

    if (!userRole) {
      return UserRole.MEMBER; // Default role
    }

    // Map database role names to enum
    const roleMapping: Record<string, UserRole> = {
      'Owner': UserRole.OWNER,
      'Admin': UserRole.ADMIN,
      'Manager': UserRole.MANAGER,
      'Member': UserRole.MEMBER,
      'Viewer': UserRole.VIEWER,
    };

    return roleMapping[userRole.role.name] || UserRole.MEMBER;
  }
}
