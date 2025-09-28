import { Module, Global } from '@nestjs/common';
import { SecurityAuditService } from './services/security-audit.service';
import { SecurityMonitoringService } from './services/security-monitoring.service';
import { SecurityAdminController } from './controllers/security-admin.controller';
import { SecurityMonitoringMiddleware } from './middleware/security-monitoring.middleware';

/**
 * Security Module
 * Provides comprehensive security auditing, monitoring, and management
 */
@Global()
@Module({
  imports: [],
  controllers: [
    SecurityAdminController,
  ],
  providers: [
    SecurityAuditService,
    SecurityMonitoringService,
    SecurityMonitoringMiddleware,
  ],
  exports: [
    SecurityAuditService,
    SecurityMonitoringService,
    SecurityMonitoringMiddleware,
  ],
})
export class SecurityModule {}
