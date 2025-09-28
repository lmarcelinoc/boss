import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { AnalyticsController } from './controllers/analytics.controller';
import { AnalyticsService } from './services/analytics.service';
import { PdfGeneratorService } from './services/pdf-generator.service';

import { EmailModule } from '../email/email.module';
import { AuthJwtModule } from '../auth/jwt.module';
import { PermissionCheckerService } from '../../common/services/permission-checker.service';
import { RBACModule } from '../rbac/rbac.module';
import { FilesModule } from '../files/files.module';
import { PrismaModule } from '../../database/prisma.module';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
    EventEmitterModule,
    EmailModule,
    AuthJwtModule,
    RBACModule,
    FilesModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, PdfGeneratorService, PermissionCheckerService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
