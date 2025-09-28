import { Module } from '@nestjs/common';
import { AuditService } from './services/audit.service';
import { PrismaAuditService } from './services/prisma-audit.service';
import { EnhancedAuditService } from './services/enhanced-audit.service';
import { AuditInterceptor } from './interceptors/audit-interceptor';
import { AuditController } from './controllers/audit.controller';
import { AuditAdminController } from './controllers/audit-admin.controller';
import { CommonModule } from '../../common/common.module';
import { PrismaModule } from '../../database/prisma.module';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [
    CommonModule, 
    PrismaModule, 
    SecurityModule, // For integration with security monitoring
  ],
  controllers: [
    AuditController,
    AuditAdminController, // Enhanced admin audit controller
  ],
  providers: [
    AuditService,
    PrismaAuditService,
    EnhancedAuditService, // Enhanced audit service with security integration
    AuditInterceptor,
  ],
  exports: [
    AuditService, 
    PrismaAuditService, 
    EnhancedAuditService,
    AuditInterceptor,
  ],
})
export class AuditModule {}