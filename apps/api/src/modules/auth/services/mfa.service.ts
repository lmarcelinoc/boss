import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../../database/prisma.service';
import { TwoFactorAuthSetup } from '@app/shared';
import { User } from '@prisma/client';

// Define local interfaces for now
interface TwoFactorAuthStatus {
  isEnabled: boolean;
  isVerified: boolean;
  backupCodesRemaining: number;
}

interface BackupCode {
  code: string;
  isUsed: boolean;
  usedAt?: Date;
}

interface MFAConfig {
  issuer: string;
  algorithm: 'sha1' | 'sha256' | 'sha512';
  digits: number;
  period: number;
  window: number;
}

@Injectable()
export class MfaService {
  private readonly mfaConfig: MFAConfig = {
    issuer: 'SaaS Boilerplate',
    algorithm: 'sha1',
    digits: 6,
    period: 30,
    window: 1,
  };

  constructor(
    private readonly prisma: PrismaService
  ) {}

  /**
   * Generate TOTP secret for user
   */
  async generateSecret(user: User): Promise<string> {
    const secret = speakeasy.generateSecret({
      name: user.email,
      issuer: this.mfaConfig.issuer,
      length: 32,
    });

    return secret.base32!;
  }

  /**
   * Generate QR code for TOTP setup
   */
  async generateQRCode(user: User, secret: string): Promise<string> {
    const otpauthUrl = speakeasy.otpauthURL({
      secret,
      label: user.email,
      issuer: this.mfaConfig.issuer,
      algorithm: this.mfaConfig.algorithm,
      digits: this.mfaConfig.digits,
      period: this.mfaConfig.period,
    });

    return QRCode.toDataURL(otpauthUrl);
  }

  /**
   * Generate backup codes
   */
  generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      codes.push(
        speakeasy.generateSecret({ length: 10 }).base32!.toUpperCase()
      );
    }
    return codes;
  }

  /**
   * Verify TOTP token
   */
  verifyToken(secret: string, token: string): boolean {
    return speakeasy.totp.verify({
      secret,
      token,
      window: this.mfaConfig.window,
      algorithm: this.mfaConfig.algorithm,
      digits: this.mfaConfig.digits,
    });
  }

  /**
   * Setup two-factor authentication for user
   */
  async setupTwoFactorAuth(user: User): Promise<TwoFactorAuthSetup> {
    // Generate new secret
    const secret = await this.generateSecret(user);

    // Generate QR code
    const qrCode = await this.generateQRCode(user, secret);

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();

    // Update user with secret and backup codes
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorSecret: secret,
        twoFactorBackupCodes: backupCodes,
      },
    });

    return {
      secret,
      qrCode,
      backupCodes,
    };
  }

  /**
   * Enable two-factor authentication
   */
  async enableTwoFactorAuth(user: User, token: string): Promise<void> {
    if (!user.twoFactorSecret) {
      throw new BadRequestException('Two-factor authentication not set up');
    }

    // Verify the token
    const isValid = this.verifyToken(user.twoFactorSecret, token);
    if (!isValid) {
      throw new UnauthorizedException('Invalid verification code');
    }

    // Enable 2FA
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: true,
      },
    });
  }

  /**
   * Disable two-factor authentication
   */
  async disableTwoFactorAuth(user: User, token: string): Promise<void> {
    if (!user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    // Verify the token
    const isValid = this.verifyToken(user.twoFactorSecret!, token);
    if (!isValid) {
      throw new UnauthorizedException('Invalid verification code');
    }

    // Disable 2FA
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: [],
      },
    });
  }

  /**
   * Verify two-factor authentication during login
   */
  async verifyTwoFactorAuth(user: User, token: string): Promise<boolean> {
    if (!user.twoFactorEnabled) {
      return true; // 2FA not enabled, consider it verified
    }

    // Check if using backup code
    if (token.length === 10 && user.twoFactorBackupCodes && user.twoFactorBackupCodes.length > 0) {
      const backupCodeIndex = user.twoFactorBackupCodes.indexOf(token);
      if (backupCodeIndex !== -1) {
        // Mark backup code as used by removing it
        const updatedCodes = [...user.twoFactorBackupCodes];
        updatedCodes.splice(backupCodeIndex, 1);
        
        await this.prisma.user.update({
          where: { id: user.id },
          data: { twoFactorBackupCodes: updatedCodes },
        });
        return true;
      }
    }

    // Verify TOTP token
    if (!user.twoFactorSecret) {
      return false;
    }

    const isValid = this.verifyToken(user.twoFactorSecret, token);

    return isValid;
  }

  /**
   * Get two-factor authentication status
   */
  async getTwoFactorStatus(user: User): Promise<TwoFactorAuthStatus> {
    return {
      isEnabled: user.twoFactorEnabled,
      isVerified: user.twoFactorEnabled, // If enabled, consider it verified for now
      backupCodesRemaining: user.twoFactorBackupCodes?.length || 0,
    };
  }

  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(user: User, token: string): Promise<string[]> {
    if (!user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    // Verify the token
    const isValid = this.verifyToken(user.twoFactorSecret!, token);
    if (!isValid) {
      throw new UnauthorizedException('Invalid verification code');
    }

    // Generate new backup codes
    const backupCodes = this.generateBackupCodes();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorBackupCodes: backupCodes },
    });

    return backupCodes;
  }

  /**
   * Check if user has exceeded MFA attempt limits
   * TODO: Implement proper attempt tracking with session/cache based solution
   */
  hasExceededAttempts(user: User): boolean {
    // For now, no attempt tracking - consider implementing with Redis later
    return false;
  }

  /**
   * Reset MFA attempt counter
   * TODO: Implement proper attempt tracking with session/cache based solution
   */
  async resetAttempts(user: User): Promise<void> {
    // For now, no attempt tracking to reset
    return;
  }
}
