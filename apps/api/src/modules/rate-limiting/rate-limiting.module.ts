import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitingService } from './services/rate-limiting.service';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { RateLimitingController } from './controllers/rate-limiting.controller';
import { RedisModule } from '../redis/redis.module';

/**
 * Rate Limiting Module
 * Provides global rate limiting functionality with Redis backend
 */
@Global()
@Module({
  imports: [
    RedisModule, // For Redis-based rate limiting
  ],
  controllers: [
    RateLimitingController,
  ],
  providers: [
    RateLimitingService,
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
  exports: [
    RateLimitingService,
    RateLimitGuard,
  ],
})
export class RateLimitingModule {}
