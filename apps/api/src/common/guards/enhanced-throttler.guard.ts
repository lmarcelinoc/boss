import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class EnhancedThrottlerGuard extends ThrottlerGuard {
  // Simplified version to avoid inheritance issues
  protected override async getTracker(req: any): Promise<string> {
    // Prioritize tracking by authenticated user ID, then tenant ID, then IP address
    if (req.user && req.user.id) {
      return req.user.id; // Track by user ID
    }
    if (req.tenantId) {
      return `tenant-${req.tenantId}`; // Track by tenant ID
    }
    return req.ip || 'unknown'; // Fallback to IP address
  }
}