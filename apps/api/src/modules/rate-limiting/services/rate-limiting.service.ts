import { Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { InjectRedis } from '@nestjs-modules/ioredis';

export interface RateLimitConfig {
  windowMs: number;    // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyPrefix?: string;  // Custom key prefix
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean;     // Don't count failed requests
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

export interface RateLimitRule {
  name: string;
  path?: string;
  method?: string;
  userType?: 'authenticated' | 'anonymous' | 'premium';
  tenantType?: 'free' | 'paid' | 'enterprise';
  config: RateLimitConfig;
}

/**
 * Redis-based Rate Limiting Service
 * Implements distributed rate limiting across multiple API instances
 */
@Injectable()
export class RateLimitingService {
  private readonly logger = new Logger(RateLimitingService.name);

  // Default rate limiting rules
  private readonly defaultRules: RateLimitRule[] = [
    // Global API rate limits
    {
      name: 'global_per_ip',
      config: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 1000,
        keyPrefix: 'rl:global:ip',
      },
    },
    
    // Authenticated user limits
    {
      name: 'auth_user_general',
      userType: 'authenticated',
      config: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 500,
        keyPrefix: 'rl:user:general',
      },
    },

    // Anonymous user limits (stricter)
    {
      name: 'anonymous_general',
      userType: 'anonymous',
      config: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 100,
        keyPrefix: 'rl:anon:general',
      },
    },

    // Tenant-based limits
    {
      name: 'tenant_free',
      tenantType: 'free',
      config: {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 1000,
        keyPrefix: 'rl:tenant:free',
      },
    },

    {
      name: 'tenant_paid',
      tenantType: 'paid',
      config: {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 10000,
        keyPrefix: 'rl:tenant:paid',
      },
    },

    {
      name: 'tenant_enterprise',
      tenantType: 'enterprise',
      config: {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 50000,
        keyPrefix: 'rl:tenant:enterprise',
      },
    },

    // Specific endpoint limits
    {
      name: 'auth_login',
      path: '/auth/login',
      method: 'POST',
      config: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 5,
        keyPrefix: 'rl:auth:login',
      },
    },

    {
      name: 'auth_register',
      path: '/auth/register',
      method: 'POST',
      config: {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 3,
        keyPrefix: 'rl:auth:register',
      },
    },

    {
      name: 'password_reset',
      path: '/auth/forgot-password',
      method: 'POST',
      config: {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 3,
        keyPrefix: 'rl:auth:reset',
      },
    },

    // File upload limits
    {
      name: 'file_upload',
      path: '/files/upload',
      method: 'POST',
      config: {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 100,
        keyPrefix: 'rl:files:upload',
      },
    },

    // API-heavy operations
    {
      name: 'bulk_operations',
      path: '/bulk/*',
      config: {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 10,
        keyPrefix: 'rl:bulk:ops',
      },
    },
  ];

  constructor(
    @InjectRedis() private readonly redis: Redis
  ) {}

  /**
   * Check if a request is allowed based on rate limiting rules
   */
  async checkRateLimit(
    key: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const { windowMs, maxRequests, keyPrefix = 'rl' } = config;
    const redisKey = `${keyPrefix}:${key}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      // Use Redis pipeline for atomic operations
      const pipeline = this.redis.pipeline();
      
      // Remove expired entries
      pipeline.zremrangebyscore(redisKey, 0, windowStart);
      
      // Count current requests in window
      pipeline.zcard(redisKey);
      
      // Add current request
      pipeline.zadd(redisKey, now, now);
      
      // Set expiration
      pipeline.expire(redisKey, Math.ceil(windowMs / 1000));
      
      const results = await pipeline.exec();
      
      if (!results) {
        throw new Error('Redis pipeline execution failed');
      }

      const currentCount = (results[1][1] as number) || 0;
      const allowed = currentCount < maxRequests;
      const remaining = Math.max(0, maxRequests - currentCount - 1);
      const resetTime = now + windowMs;
      
      let retryAfter: number | undefined;
      if (!allowed) {
        // Calculate when the user can try again
        const oldestRequest = await this.redis.zrange(redisKey, 0, 0, 'WITHSCORES');
        if (oldestRequest.length >= 2) {
          const oldestTimestamp = parseInt(oldestRequest[1] as string);
          retryAfter = Math.ceil((oldestTimestamp + windowMs - now) / 1000);
        }
      }

      this.logger.debug(
        `Rate limit check for ${redisKey}: ${currentCount}/${maxRequests} requests, allowed: ${allowed}`
      );

      return {
        allowed,
        count: currentCount,
        remaining,
        resetTime,
        retryAfter,
      };

    } catch (error) {
      this.logger.error(`Rate limiting error for key ${redisKey}:`, error);
      
      // Fail open - allow the request if Redis is down
      return {
        allowed: true,
        count: 0,
        remaining: maxRequests,
        resetTime: now + windowMs,
      };
    }
  }

  /**
   * Check multiple rate limiting rules for a request
   */
  async checkMultipleRateLimits(
    checks: Array<{ key: string; config: RateLimitConfig }>
  ): Promise<RateLimitResult[]> {
    const results = await Promise.all(
      checks.map(({ key, config }) => this.checkRateLimit(key, config))
    );

    return results;
  }

  /**
   * Get applicable rate limiting rules for a request
   */
  getApplicableRules(context: {
    path: string;
    method: string;
    userType: 'authenticated' | 'anonymous';
    tenantType?: 'free' | 'paid' | 'enterprise';
    isPremium?: boolean;
  }): RateLimitRule[] {
    const { path, method, userType, tenantType } = context;
    
    return this.defaultRules.filter(rule => {
      // Check path match
      if (rule.path) {
        if (rule.path.includes('*')) {
          const pathPattern = rule.path.replace(/\*/g, '.*');
          if (!new RegExp(`^${pathPattern}$`).test(path)) {
            return false;
          }
        } else if (rule.path !== path) {
          return false;
        }
      }

      // Check method match
      if (rule.method && rule.method !== method) {
        return false;
      }

      // Check user type match
      if (rule.userType && rule.userType !== userType) {
        return false;
      }

      // Check tenant type match
      if (rule.tenantType && rule.tenantType !== tenantType) {
        return false;
      }

      return true;
    });
  }

  /**
   * Build rate limiting key for a request
   */
  buildRateLimitKey(
    rule: RateLimitRule,
    context: {
      ip: string;
      userId?: string;
      tenantId?: string;
      userAgent?: string;
    }
  ): string {
    const { ip, userId, tenantId } = context;
    const parts: string[] = [];

    // Add specific identifiers based on rule type
    if (rule.name.includes('ip') || rule.userType === 'anonymous') {
      parts.push(`ip:${ip}`);
    }

    if (rule.userType === 'authenticated' && userId) {
      parts.push(`user:${userId}`);
    }

    if (rule.tenantType && tenantId) {
      parts.push(`tenant:${tenantId}`);
    }

    if (rule.path) {
      parts.push(`path:${rule.path}`);
    }

    if (rule.method) {
      parts.push(`method:${rule.method}`);
    }

    return parts.join(':');
  }

  /**
   * Get current rate limiting status for debugging
   */
  async getRateLimitStatus(
    key: string,
    config: RateLimitConfig
  ): Promise<{
    key: string;
    currentCount: number;
    limit: number;
    remaining: number;
    resetTime: number;
    windowMs: number;
  }> {
    const { windowMs, maxRequests, keyPrefix = 'rl' } = config;
    const redisKey = `${keyPrefix}:${key}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      const currentCount = await this.redis.zcount(redisKey, windowStart, now);
      const remaining = Math.max(0, maxRequests - currentCount);
      const resetTime = now + windowMs;

      return {
        key: redisKey,
        currentCount,
        limit: maxRequests,
        remaining,
        resetTime,
        windowMs,
      };
    } catch (error) {
      this.logger.error(`Error getting rate limit status for ${redisKey}:`, error);
      throw error;
    }
  }

  /**
   * Reset rate limit for a specific key (admin function)
   */
  async resetRateLimit(key: string, keyPrefix: string = 'rl'): Promise<void> {
    const redisKey = `${keyPrefix}:${key}`;
    
    try {
      await this.redis.del(redisKey);
      this.logger.log(`Rate limit reset for key: ${redisKey}`);
    } catch (error) {
      this.logger.error(`Error resetting rate limit for ${redisKey}:`, error);
      throw error;
    }
  }

  /**
   * Get all active rate limiting keys (for monitoring)
   */
  async getActiveRateLimitKeys(pattern: string = 'rl:*'): Promise<string[]> {
    try {
      const keys = await this.redis.keys(pattern);
      return keys;
    } catch (error) {
      this.logger.error(`Error getting rate limit keys with pattern ${pattern}:`, error);
      throw error;
    }
  }

  /**
   * Clean up expired rate limiting data
   */
  async cleanupExpiredData(): Promise<number> {
    this.logger.log('Starting rate limiting cleanup...');
    
    try {
      const keys = await this.getActiveRateLimitKeys();
      const now = Date.now();
      let cleanedCount = 0;

      for (const key of keys) {
        // Remove entries older than 24 hours (cleanup old data)
        const cutoff = now - (24 * 60 * 60 * 1000);
        const removed = await this.redis.zremrangebyscore(key, 0, cutoff);
        
        if (removed > 0) {
          cleanedCount += removed;
          this.logger.debug(`Cleaned ${removed} expired entries from ${key}`);
        }

        // Remove empty sorted sets
        const count = await this.redis.zcard(key);
        if (count === 0) {
          await this.redis.del(key);
          this.logger.debug(`Removed empty rate limit key: ${key}`);
        }
      }

      this.logger.log(`Rate limiting cleanup completed: ${cleanedCount} entries cleaned`);
      return cleanedCount;
    } catch (error) {
      this.logger.error('Rate limiting cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Get rate limiting statistics
   */
  async getRateLimitingStats(): Promise<{
    totalKeys: number;
    activeKeys: number;
    keysByType: Record<string, number>;
    topLimitedKeys: Array<{ key: string; count: number }>;
  }> {
    try {
      const allKeys = await this.getActiveRateLimitKeys();
      const keysByType: Record<string, number> = {};
      const keyData: Array<{ key: string; count: number }> = [];

      for (const key of allKeys) {
        // Extract type from key (e.g., 'rl:user:general' -> 'user')
        const parts = key.split(':');
        const type = parts[1] || 'unknown';
        keysByType[type] = (keysByType[type] || 0) + 1;

        // Get current count for this key
        const count = await this.redis.zcard(key);
        if (count > 0) {
          keyData.push({ key, count });
        }
      }

      // Sort by count and take top 10
      const topLimitedKeys = keyData
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalKeys: allKeys.length,
        activeKeys: keyData.length,
        keysByType,
        topLimitedKeys,
      };
    } catch (error) {
      this.logger.error('Error getting rate limiting stats:', error);
      throw error;
    }
  }
}
