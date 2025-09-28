import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Module, Controller, Get } from '@nestjs/common';

// Simple health controller
@Controller('health')
class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
    };
  }
}

// Minimal app module with only health endpoint
@Module({
  controllers: [HealthController],
})
class StandaloneSwaggerAppModule {}

async function bootstrap() {
  const app = await NestFactory.create(StandaloneSwaggerAppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  // Enable CORS for development
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:19000'],
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Comprehensive Swagger setup for authentication system
  const config = new DocumentBuilder()
    .setTitle('SaaS Boilerplate API Documentation')
    .setDescription(`
# SaaS Boilerplate Authentication API

This API provides comprehensive authentication and authorization features for a multi-tenant SaaS application.

## 🔐 Authentication Features

### Core Authentication
- **User Registration**: Email-based registration with verification
- **Login/Logout**: Secure authentication with JWT tokens
- **Password Reset**: Email-based password recovery flow
- **Session Management**: Persistent sessions with refresh tokens

### Multi-Factor Authentication (MFA)
- **TOTP Authentication**: Google Authenticator compatible
- **Backup Codes**: Emergency access codes
- **QR Code Generation**: Easy setup for authenticator apps
- **MFA Recovery**: Account recovery with MFA reset

### Security Features
- **Password Hashing**: Bcrypt with configurable rounds
- **Rate Limiting**: Configurable request throttling
- **Account Lockout**: Brute force protection
- **Session Security**: HTTP-only cookies, CSRF protection
- **Input Validation**: Comprehensive request validation

### Multi-Tenancy
- **Tenant Isolation**: Data separation between organizations
- **Tenant Switching**: Users can belong to multiple tenants
- **Role-Based Access**: Different permissions per tenant
- **Tenant Branding**: Custom styling per organization

## 🚀 API Endpoints

### Authentication Endpoints
- \`POST /auth/register\` - User registration
- \`POST /auth/login\` - User login
- \`POST /auth/logout\` - User logout
- \`POST /auth/refresh\` - Refresh access token
- \`POST /auth/forgot-password\` - Request password reset
- \`POST /auth/reset-password\` - Reset password with token
- \`POST /auth/verify-email\` - Verify email address
- \`POST /auth/change-password\` - Change password (authenticated)

### MFA Endpoints
- \`POST /auth/mfa/setup\` - Setup MFA for user
- \`POST /auth/mfa/verify\` - Verify MFA token
- \`POST /auth/mfa/disable\` - Disable MFA
- \`GET /auth/mfa/backup-codes\` - Get backup codes
- \`POST /auth/mfa/recovery\` - MFA account recovery

### User Management
- \`GET /users/profile\` - Get user profile
- \`PUT /users/profile\` - Update user profile
- \`GET /users/sessions\` - List active sessions
- \`DELETE /users/sessions/:id\` - Terminate session

### Tenant Management
- \`GET /tenants\` - List user's tenants
- \`POST /tenants/switch\` - Switch active tenant
- \`GET /tenants/current\` - Get current tenant info

## 🔧 Configuration

The API supports extensive configuration through environment variables:

### Authentication Settings
- \`JWT_SECRET\` - JWT signing secret (minimum 32 characters)
- \`JWT_EXPIRES_IN\` - Access token expiration (default: 15m)
- \`JWT_REFRESH_EXPIRES_IN\` - Refresh token expiration (default: 7d)
- \`BCRYPT_ROUNDS\` - Password hashing rounds (default: 12)

### Security Settings
- \`RATE_LIMIT_WINDOW_MS\` - Rate limiting window (default: 900000ms)
- \`RATE_LIMIT_MAX_REQUESTS\` - Max requests per window (default: 100)
- \`SESSION_SECRET\` - Session signing secret
- \`COOKIE_SECRET\` - Cookie signing secret

### Email Configuration
- \`EMAIL_PROVIDER\` - Email service (smtp, ses, sendgrid, postmark)
- \`SMTP_HOST\`, \`SMTP_PORT\` - SMTP configuration
- \`SENDGRID_API_KEY\` - SendGrid API key
- \`AWS_SES_*\` - AWS SES configuration

## 📊 Testing & Documentation

### Comprehensive Test Suite
- **Unit Tests**: 200+ test cases covering all authentication logic
- **Integration Tests**: End-to-end authentication flows
- **Security Tests**: Rate limiting, brute force protection
- **E2E Tests**: Complete user scenarios

### API Documentation
- **OpenAPI 3.0**: Complete API specification
- **Postman Collection**: Pre-configured requests for testing
- **Developer Guide**: Detailed implementation documentation

## 🏗️ Architecture

### Clean Architecture
- **Domain Layer**: Business logic and entities
- **Application Layer**: Use cases and services
- **Infrastructure Layer**: Database, email, external services
- **Presentation Layer**: Controllers and DTOs

### Database Design
- **Prisma ORM**: Type-safe database access
- **PostgreSQL**: Production database
- **Migrations**: Version-controlled schema changes
- **Row-Level Security**: Database-level tenant isolation

### Security Implementation
- **OWASP Compliance**: Following security best practices
- **Helmet.js**: Security headers
- **CORS Configuration**: Cross-origin request handling
- **Input Sanitization**: XSS protection

## 📈 Performance & Scalability

### Caching Strategy
- **Redis**: Session storage and rate limiting
- **In-Memory**: Frequently accessed data
- **Database Indexing**: Optimized queries

### Monitoring
- **Health Checks**: System status endpoints  
- **Logging**: Structured application logs
- **Metrics**: Performance monitoring
- **Error Tracking**: Comprehensive error handling

## 🔗 Integration

### Third-Party Services
- **Email Providers**: SMTP, SendGrid, AWS SES, Postmark
- **Payment Processing**: Stripe integration ready
- **File Storage**: AWS S3, Google Cloud Storage support
- **Monitoring**: Sentry, DataDog, New Relic ready

### API Clients
- **Frontend SDK**: React/Next.js integration
- **Mobile SDK**: React Native compatibility
- **TypeScript**: Full type definitions
- **REST & GraphQL**: Flexible API access patterns

---

**Note**: This documentation represents the complete authentication system. The actual API server with full functionality is currently being migrated from TypeORM to Prisma. Once the migration is complete, all endpoints will be fully functional.

**Current Status**: This is a documentation-only server. The main API server is undergoing TypeORM to Prisma migration and will be available soon.
    `)
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('session')
    .addTag('Authentication', 'User authentication and authorization')
    .addTag('Health', 'System health checks')
    .addTag('MFA', 'Multi-factor authentication')
    .addTag('Users', 'User management and profiles')
    .addTag('Tenants', 'Multi-tenant organization management')
    .addServer('http://localhost:3001', 'Development Server')
    .addServer('https://api.yourdomain.com', 'Production Server')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      docExpansion: 'none',
      filter: true,
      tryItOutEnabled: true,
    },
    customCss: `
      .swagger-ui .topbar { background-color: #1f2937; }
      .swagger-ui .topbar .download-url-wrapper { display: none; }
      .swagger-ui .info .title { color: #1f2937; }
      .swagger-ui .info .description p { margin-bottom: 1em; }
    `,
    customSiteTitle: 'SaaS Boilerplate API Documentation',
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);
  
  console.log(`🚀 Standalone Swagger documentation server running on port ${port}`);
  console.log(`📚 Swagger docs available at: http://localhost:${port}/api/docs`);
  console.log(`💚 Health check available at: http://localhost:${port}/health`);
  console.log(``);
  console.log(`📋 **Available Documentation:**`);
  console.log(`   • Authentication API: Complete auth system documentation`);
  console.log(`   • Security Features: MFA, rate limiting, session management`);
  console.log(`   • Multi-tenancy: Tenant isolation and switching`);
  console.log(`   • Configuration: Environment variable reference`);
  console.log(`   • Testing: Comprehensive test suite information`);
  console.log(`   • Architecture: Clean architecture implementation`);
  console.log(``);
  console.log(`🔧 **Note**: This is a documentation-only server.`);
  console.log(`   The main API server is being migrated from TypeORM to Prisma.`);
}

bootstrap().catch(err => {
  console.error('Failed to start standalone swagger server:', err);
  process.exit(1);
});
