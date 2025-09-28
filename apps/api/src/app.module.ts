import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './database/prisma.module';
import { BullModule } from '@nestjs/bull';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { RedisModule } from '@nestjs-modules/ioredis';

import { env } from '@app/config';

// Import modules
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TeamsModule } from './modules/teams/teams.module';
import { RBACModule } from './modules/rbac/rbac.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { AuditModule } from './modules/audit/audit.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { RateLimitingModule } from './modules/rate-limiting/rate-limiting.module';
import { SecurityModule } from './modules/security/security.module';
import { FilesModule } from './modules/files/files.module';
import { EmailModule } from './modules/email/email.module';
// import { AnalyticsModule } from './modules/analytics/analytics.module'; // Temporarily disabled
import { PaymentsModule } from './modules/payments/payments.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { BillingModule } from './modules/billing/billing.module';
import { TenantMiddlewareModule } from './common/middleware/tenant-middleware.module';
import { TenantIsolationMiddleware } from './common/middleware/tenant-isolation.middleware';
import { SecurityMiddleware, ResponseTimeMiddleware } from './common/middleware/security.middleware';
import { SecurityMonitoringMiddleware } from './modules/security/middleware/security-monitoring.middleware';
// import { AuditInterceptor } from './modules/audit/interceptors/audit-interceptor';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: [() => ({ env })],
    }),

    // Event emitter
    EventEmitterModule.forRoot(),

    // Database
    PrismaModule,

    // Redis
    RedisModule.forRoot({
      type: 'single',
      options: {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        ...(env.REDIS_PASSWORD && { password: env.REDIS_PASSWORD }),
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      },
    }),

    // Queue management
    BullModule.forRoot({
      redis: {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD ?? '',
      },
      defaultJobOptions: {
        attempts: env.QUEUE_RETRY_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    }),

    // Feature modules
    CommonModule,
    AuthModule,
    UsersModule,
    TeamsModule,
    RBACModule,
    InvitationsModule,
    AuditModule,
    TenantsModule,
    RateLimitingModule, // Custom Redis-based rate limiting
    SecurityModule, // Security auditing and monitoring
    TenantMiddlewareModule,
    FilesModule,
    EmailModule,
    // AnalyticsModule, // Temporarily disabled due to Prisma migration
    PaymentsModule,
    SubscriptionsModule,
    BillingModule,
  ],
  controllers: [],
  providers: [
    // Temporarily disabled audit interceptor
    // {
    //   provide: APP_INTERCEPTOR,
    //   useClass: AuditInterceptor,
    // },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply security middleware first (global)
    consumer
      .apply(ResponseTimeMiddleware, SecurityMiddleware, SecurityMonitoringMiddleware)
      .forRoutes('*');

    // Apply tenant isolation middleware with proper exclusions
    consumer
      .apply(TenantIsolationMiddleware)
      .exclude(
        // Public auth routes (with API prefix)
        'api/auth/login',
        'api/auth/register',
        'api/auth/forgot-password',
        'api/auth/reset-password',
        'api/auth/verify-email',
        'api/auth/resend-verification',
        'api/auth/refresh',
        // Health check and documentation
        '/health',
        'api/docs',
        'api/docs-json',
        // Static assets and favicon
        'favicon.ico',
        // Swagger assets
        'api/docs/(.*)',
        // Super Admin routes (platform-level, no tenant context required)
        'api/admin/system/(.*)',
      )
      .forRoutes('*');
  }
}
