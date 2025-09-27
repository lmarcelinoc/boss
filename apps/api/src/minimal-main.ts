import { NestFactory } from '@nestjs/core';
import { Module, Controller, Post, Body, Get } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';

// DTOs for validation
class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  tenantName: string;
}

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

// Auth Controller
@Controller('api/auth')
export class AuthController {
  private prisma = new PrismaClient();

  @Get('/health')
  health() {
    return { status: 'ok', service: 'auth-api', timestamp: new Date().toISOString() };
  }

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    try {
      // Check if user already exists
      const existingUser = await this.prisma.user.findUnique({
        where: { email: registerDto.email }
      });

      if (existingUser) {
        return { error: 'User already exists' };
      }

      // Hash password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(registerDto.password, saltRounds);

      // Create user (tenant will be created on first login)
      const user = await this.prisma.user.create({
        data: {
          email: registerDto.email,
          password: hashedPassword,
          firstName: registerDto.firstName,
          lastName: registerDto.lastName,
          isActive: true,
          emailVerified: true, // Simplified for demo
          status: 'active',
        }
      });

      return {
        message: 'User registered successfully',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        }
      };
    } catch (error) {
      console.error('Registration error:', error);
      return { error: 'Registration failed' };
    }
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    try {
      // Find user
      const user = await this.prisma.user.findUnique({
        where: { email: loginDto.email }
      });

      if (!user) {
        return { error: 'Invalid credentials' };
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
      if (!isPasswordValid) {
        return { error: 'Invalid credentials' };
      }

      // Create or get tenant on first login (as per architecture)
      let tenant = null;
      if (!user.tenantId) {
        tenant = await this.prisma.tenant.create({
          data: {
            name: `${user.firstName}'s Organization`,
            slug: `tenant-${user.id}`,
            isActive: true,
            settings: {}
          }
        });

        // Update user with tenant
        await this.prisma.user.update({
          where: { id: user.id },
          data: { tenantId: tenant.id }
        });
      } else {
        tenant = await this.prisma.tenant.findUnique({
          where: { id: user.tenantId }
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: user.id, 
          email: user.email,
          tenantId: tenant?.id || user.tenantId 
        },
        process.env.JWT_SECRET || 'fallback-secret-key-change-in-production',
        { expiresIn: '24h' }
      );

      return {
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          tenantId: tenant?.id || user.tenantId
        },
        tenant: tenant ? {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug
        } : null
      };
    } catch (error) {
      console.error('Login error:', error);
      return { error: 'Login failed' };
    }
  }
}

// Health Controller
@Controller()
export class HealthController {
  @Get('health')
  health() {
    return { 
      status: 'ok', 
      service: 'saas-boilerplate-api',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  }
}

// Minimal App Module
@Module({
  controllers: [AuthController, HealthController],
})
export class MinimalAppModule {}

// Bootstrap function
async function bootstrap() {
  const app = await NestFactory.create(MinimalAppModule);
  
  // Enable CORS for frontend communication
  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  const port = process.env.PORT || 3001;
  await app.listen(port);

  console.log(`🚀 Minimal API is running on: http://localhost:${port}`);
  console.log(`🏥 Health Check: http://localhost:${port}/health`);
  console.log(`🔐 Auth Endpoints: http://localhost:${port}/api/auth/*`);
}

bootstrap().catch(error => {
  console.error('Failed to start minimal API:', error);
  process.exit(1);
});
