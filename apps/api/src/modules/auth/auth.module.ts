import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

// Database
import { PrismaModule } from '../../database/prisma.module';

// Controllers
import { AuthController } from './controllers/auth.controller';
import { MfaController } from './controllers/mfa.controller';
import { SessionController } from './controllers/session.controller';

// Services
import { AuthService } from './services/auth.service';
import { JwtService } from './services/jwt.service';
import { MfaService } from './services/mfa.service';
import { SessionService } from './services/session.service';
import { RefreshTokenService } from './services/refresh-token.service';

// Strategies
import { JwtStrategy } from './strategies/jwt.strategy';

// Guards
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { EnhancedAuthGuard } from './guards/enhanced-auth.guard';

// Common Module
import { CommonModule } from '../../common/common.module';

// Import other modules
import { RBACModule } from '../rbac/rbac.module';
import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../email/email.module';
import { AuthJwtModule } from './jwt.module';

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    AuthJwtModule,
    CommonModule,
    RBACModule,
    AuditModule,
    EmailModule,
  ],
  controllers: [AuthController, MfaController, SessionController],
  providers: [
    AuthService,
    MfaService,
    SessionService,
    RefreshTokenService,
    JwtStrategy,
    JwtAuthGuard,
    EnhancedAuthGuard,
  ],
  exports: [
    AuthService,
    MfaService,
    SessionService,
    RefreshTokenService,
    JwtAuthGuard,
    EnhancedAuthGuard,
  ],
})
export class AuthModule {}
