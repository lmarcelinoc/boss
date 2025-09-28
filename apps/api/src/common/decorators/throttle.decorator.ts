import { SetMetadata, applyDecorators, UseGuards } from '@nestjs/common';
import { EnhancedThrottlerGuard } from '../guards/enhanced-throttler.guard';

// Metadata keys for different throttling types
export const THROTTLE_USER_KEY = 'throttle_user';
export const THROTTLE_TENANT_KEY = 'throttle_tenant';  
export const THROTTLE_IP_KEY = 'throttle_ip';
export const THROTTLE_SKIP_KEY = 'throttle_skip';

// Throttling configuration interface
export interface ThrottleConfig {
  ttl: number; // Time to live in milliseconds
  limit: number; // Maximum requests within TTL
}

/**
 * Skip throttling entirely for this endpoint
 */
export const SkipThrottle = () => SetMetadata(THROTTLE_SKIP_KEY, true);

/**
 * Apply IP-based throttling
 */
export const ThrottleIP = (config: ThrottleConfig) =>
  applyDecorators(
    SetMetadata(THROTTLE_IP_KEY, config),
    UseGuards(EnhancedThrottlerGuard)
  );

/**
 * Apply user-based throttling (requires authentication)
 */
export const ThrottleUser = (config: ThrottleConfig) =>
  applyDecorators(
    SetMetadata(THROTTLE_USER_KEY, config),
    UseGuards(EnhancedThrottlerGuard)
  );

/**
 * Apply tenant-based throttling (requires tenant context)
 */
export const ThrottleTenant = (config: ThrottleConfig) =>
  applyDecorators(
    SetMetadata(THROTTLE_TENANT_KEY, config),
    UseGuards(EnhancedThrottlerGuard)
  );

/**
 * Apply multiple throttling layers
 */
export const ThrottleMultiple = (configs: {
  ip?: ThrottleConfig;
  user?: ThrottleConfig;
  tenant?: ThrottleConfig;
}) =>
  applyDecorators(
    ...(configs.ip ? [SetMetadata(THROTTLE_IP_KEY, configs.ip)] : []),
    ...(configs.user ? [SetMetadata(THROTTLE_USER_KEY, configs.user)] : []),
    ...(configs.tenant ? [SetMetadata(THROTTLE_TENANT_KEY, configs.tenant)] : []),
    UseGuards(EnhancedThrottlerGuard)
  );

// Pre-configured common throttling patterns

/**
 * Strict throttling for sensitive operations
 */
export const StrictThrottle = () =>
  ThrottleMultiple({
    ip: { ttl: 300000, limit: 5 }, // 5 requests per 5 minutes per IP
    user: { ttl: 300000, limit: 10 }, // 10 requests per 5 minutes per user
    tenant: { ttl: 60000, limit: 50 }, // 50 requests per minute per tenant
  });

/**
 * Authentication throttling (login, register, etc.)
 */
export const AuthThrottle = () =>
  ThrottleMultiple({
    ip: { ttl: 900000, limit: 10 }, // 10 requests per 15 minutes per IP
    user: { ttl: 900000, limit: 5 }, // 5 requests per 15 minutes per user
  });

/**
 * API throttling for general endpoints
 */
export const ApiThrottle = () =>
  ThrottleMultiple({
    ip: { ttl: 60000, limit: 100 }, // 100 requests per minute per IP
    user: { ttl: 60000, limit: 200 }, // 200 requests per minute per user
    tenant: { ttl: 60000, limit: 1000 }, // 1000 requests per minute per tenant
  });

/**
 * File upload throttling
 */
export const UploadThrottle = () =>
  ThrottleMultiple({
    ip: { ttl: 60000, limit: 10 }, // 10 uploads per minute per IP
    user: { ttl: 60000, limit: 20 }, // 20 uploads per minute per user
    tenant: { ttl: 60000, limit: 100 }, // 100 uploads per minute per tenant
  });

/**
 * Heavy operation throttling (reports, exports, etc.)
 */
export const HeavyOperationThrottle = () =>
  ThrottleMultiple({
    ip: { ttl: 300000, limit: 2 }, // 2 requests per 5 minutes per IP
    user: { ttl: 300000, limit: 5 }, // 5 requests per 5 minutes per user
    tenant: { ttl: 300000, limit: 20 }, // 20 requests per 5 minutes per tenant
  });

/**
 * Email/SMS throttling
 */
export const CommunicationThrottle = () =>
  ThrottleMultiple({
    ip: { ttl: 3600000, limit: 10 }, // 10 messages per hour per IP
    user: { ttl: 3600000, limit: 20 }, // 20 messages per hour per user
    tenant: { ttl: 3600000, limit: 100 }, // 100 messages per hour per tenant
  });

/**
 * Search throttling
 */
export const SearchThrottle = () =>
  ThrottleMultiple({
    ip: { ttl: 60000, limit: 50 }, // 50 searches per minute per IP
    user: { ttl: 60000, limit: 100 }, // 100 searches per minute per user
    tenant: { ttl: 60000, limit: 500 }, // 500 searches per minute per tenant
  });

/**
 * Billing operation throttling
 */
export const BillingThrottle = () =>
  ThrottleMultiple({
    ip: { ttl: 300000, limit: 5 }, // 5 requests per 5 minutes per IP
    user: { ttl: 300000, limit: 10 }, // 10 requests per 5 minutes per user
    tenant: { ttl: 300000, limit: 20 }, // 20 requests per 5 minutes per tenant
  });
