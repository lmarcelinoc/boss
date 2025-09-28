import { SetMetadata } from '@nestjs/common';
import { RateLimitConfig } from '../services/rate-limiting.service';

export const RATE_LIMIT_KEY = 'rate_limit';
export const SKIP_RATE_LIMIT_KEY = 'skip_rate_limit';

/**
 * Apply custom rate limiting to an endpoint
 */
export const RateLimit = (config: RateLimitConfig) => SetMetadata(RATE_LIMIT_KEY, config);

/**
 * Skip rate limiting for an endpoint
 */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);

/**
 * Convenience decorators for common rate limiting patterns
 */

/**
 * Strict rate limiting for sensitive operations
 */
export const StrictRateLimit = (maxRequests: number = 5, windowMinutes: number = 15) =>
  RateLimit({
    windowMs: windowMinutes * 60 * 1000,
    maxRequests,
    keyPrefix: 'rl:strict',
  });

/**
 * Moderate rate limiting for regular API endpoints
 */
export const ModerateRateLimit = (maxRequests: number = 100, windowMinutes: number = 15) =>
  RateLimit({
    windowMs: windowMinutes * 60 * 1000,
    maxRequests,
    keyPrefix: 'rl:moderate',
  });

/**
 * Lenient rate limiting for read-only operations
 */
export const LenientRateLimit = (maxRequests: number = 1000, windowMinutes: number = 15) =>
  RateLimit({
    windowMs: windowMinutes * 60 * 1000,
    maxRequests,
    keyPrefix: 'rl:lenient',
  });

/**
 * Authentication-specific rate limiting
 */
export const AuthRateLimit = () =>
  RateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    keyPrefix: 'rl:auth',
  });

/**
 * File upload rate limiting
 */
export const UploadRateLimit = () =>
  RateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 50,
    keyPrefix: 'rl:upload',
  });

/**
 * Bulk operations rate limiting
 */
export const BulkOperationRateLimit = () =>
  RateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10,
    keyPrefix: 'rl:bulk',
  });

/**
 * Admin operations rate limiting (more lenient for privileged users)
 */
export const AdminRateLimit = () =>
  RateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 1000,
    keyPrefix: 'rl:admin',
  });

/**
 * Public API rate limiting (stricter for unauthenticated users)
 */
export const PublicRateLimit = () =>
  RateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 50,
    keyPrefix: 'rl:public',
  });

/**
 * Search/Query rate limiting
 */
export const SearchRateLimit = () =>
  RateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
    keyPrefix: 'rl:search',
  });

/**
 * Export operations rate limiting
 */
export const ExportRateLimit = () =>
  RateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 5,
    keyPrefix: 'rl:export',
  });

/**
 * Notification/Email sending rate limiting
 */
export const NotificationRateLimit = () =>
  RateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100,
    keyPrefix: 'rl:notification',
  });

/**
 * Custom rate limiting with time-based scaling
 */
export const ScalingRateLimit = (
  baseRequests: number,
  baseWindowMinutes: number,
  scaleFactor: number = 1.5
) => {
  // Example: Allow more requests during business hours
  const now = new Date();
  const hour = now.getHours();
  const isBusinessHours = hour >= 9 && hour <= 17;
  
  const adjustedRequests = isBusinessHours 
    ? Math.floor(baseRequests * scaleFactor) 
    : baseRequests;
  
  return RateLimit({
    windowMs: baseWindowMinutes * 60 * 1000,
    maxRequests: adjustedRequests,
    keyPrefix: 'rl:scaling',
  });
};

/**
 * Tenant-aware rate limiting
 */
export const TenantRateLimit = (freeLimit: number, paidLimit: number, enterpriseLimit: number) => {
  // This would need to be implemented with context-aware logic
  // For now, returning a moderate limit
  return ModerateRateLimit(paidLimit);
};

/**
 * Role-based rate limiting
 */
export const RoleBasedRateLimit = (limits: { [role: string]: number }) => {
  // Default to member limits if no specific role found
  const defaultLimit = limits['Member'] || limits['member'] || 100;
  
  return RateLimit({
    windowMs: 15 * 60 * 1000,
    maxRequests: defaultLimit,
    keyPrefix: 'rl:role',
  });
};
