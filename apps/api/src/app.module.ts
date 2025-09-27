import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './database/prisma.module';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';

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
import { FilesModule } from './modules/files/files.module';
import { EmailModule } from './modules/email/email.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { BillingModule } from './modules/billing/billing.module';
import { TenantMiddlewareModule } from './common/middleware/tenant-middleware.module';
import { TenantIsolationMiddleware } from './common/middleware/tenant-isolation.middleware';

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

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: env.RATE_LIMIT_WINDOW_MS,
        limit: env.RATE_LIMIT_MAX_REQUESTS,
      },
    ]),

    // Feature modules
    CommonModule,
    AuthModule,
    UsersModule,
    TeamsModule,
    RBACModule,
    InvitationsModule,
    AuditModule,
    TenantsModule,
    TenantMiddlewareModule,
    FilesModule,
    EmailModule,
    AnalyticsModule,
    PaymentsModule,
    SubscriptionsModule,
    BillingModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Temporarily disable tenant isolation middleware to test auth endpoints
    // consumer
    //   .apply(TenantIsolationMiddleware)
    //   .exclude(
    //     // Public auth routes (with API prefix)
    //     'api/auth/login',
    //     'api/auth/register',
    //     'api/auth/forgot-password',
    //     'api/auth/reset-password',
    //     'api/auth/verify-email',
    //     'api/auth/resend-verification',
    //     'api/auth/refresh',
    //     // Health check and documentation
    //     '/health',
    //     'api/docs',
    //     'api/docs-json',
    //     // Static assets and favicon
    //     'favicon.ico',
    //     // Swagger assets
    //     'api/docs/(.*)',
    //   )
    //   .forRoutes('*');
  }
}
