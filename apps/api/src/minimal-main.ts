import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { env } from '@app/config';
import { MinimalAppModule } from './minimal-app.module';

async function bootstrap() {
  const app = await NestFactory.create(MinimalAppModule, {
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

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('SaaS Boilerplate API')
    .setDescription('Comprehensive SaaS API with authentication, multi-tenancy, and more')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('session')
    .addTag('Authentication', 'User authentication and authorization')
    .addTag('Health', 'System health checks')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  // Add a simple health endpoint
  app.use('/health', (req: any, res: any) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV,
      version: '1.0.0',
    });
  });

  const port = env.PORT || 3001;
  await app.listen(port);
  
  console.log(`🚀 Minimal API server running on port ${port}`);
  console.log(`📚 Swagger docs available at: http://localhost:${port}/api/docs`);
  console.log(`💚 Health check available at: http://localhost:${port}/health`);
}