import { config } from 'dotenv';

// Load environment variables from .env file first
config();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { Request, Response } from 'express';
import { AppModule } from './app.module';
import { env, isDevelopment, isProduction } from '@app/config';
import { getSecurityConfig } from './config/security.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Get security configuration
  const securityConfig = getSecurityConfig();

  // Security middleware with enhanced configuration
  app.use(helmet());

  // Compression middleware
  app.use(compression());

  // CORS configuration with enhanced security
  app.enableCors(securityConfig.cors);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  );

  // Global prefix
  app.setGlobalPrefix('api');

  // Swagger documentation
  if (isDevelopment()) {
    const config = new DocumentBuilder()
      .setTitle('SaaS Boilerplate API')
      .setDescription(
        'Comprehensive enterprise-grade SaaS boilerplate API with multi-tenancy, authentication, billing, and real-time features. This API provides all the necessary endpoints for building scalable SaaS applications with role-based access control, secure payment processing, file management, and administrative features.'
      )
      .setVersion('1.0.0')
      .setContact(
        'SaaS Boilerplate Support',
        'https://github.com/your-org/saas-boilerplate',
        'support@yourdomain.com'
      )
      .setLicense('MIT', 'https://opensource.org/licenses/MIT')
      .addServer('http://localhost:3001', 'Development server')
      .addServer('https://api.yourdomain.com', 'Production server')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth'
      )
      .addTag('Authentication', 'User authentication and authorization endpoints')
      .addTag('Users', 'User management and profile endpoints')
      .addTag('Tenants', 'Multi-tenant organization management')
      .addTag('Billing', 'Payment processing and subscription management')
      .addTag('Files', 'File upload, storage, and management')
      .addTag('Teams', 'Team and collaboration management')
      .addTag('Invitations', 'User invitation and onboarding')
      .addTag('Analytics', 'Usage analytics and reporting')
      .addTag('Audit', 'Audit logging and compliance')
      .addTag('Admin', 'Platform administration endpoints')
      .addTag('RBAC', 'Role-based access control')
      .addTag('Subscriptions', 'Subscription plan management')
      .addTag('Payments', 'Payment method and transaction handling')
      .addTag('Email', 'Email notifications and templates')
      .addTag('Delegation', 'Permission delegation and temporary access')
      .build();

    const document = SwaggerModule.createDocument(app, config, {
      operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
      deepScanRoutes: true,
    });

    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'none',
        filter: true,
        showRequestHeaders: true,
        tryItOutEnabled: true,
      },
      customSiteTitle: 'SaaS Boilerplate API Documentation',
      customfavIcon: '/favicon.ico',
      customCss: `
        .swagger-ui .topbar { display: none }
        .swagger-ui .info .title { color: #3b82f6; }
      `,
    });

    // Also expose the raw OpenAPI JSON
    app.getHttpAdapter().getInstance().get('/api/docs-json', (_req: any, res: any) => {
      res.json(document);
    });
  }

  // Health check endpoint
  app
    .getHttpAdapter()
    .getInstance()
    .get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: env.NODE_ENV,
        version: '1.0.0',
      });
    });

  const port = env.PORT || 3001;
  await app.listen(port);

  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
  console.log(`🏥 Health Check: http://localhost:${port}/health`);
}

bootstrap().catch(error => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
