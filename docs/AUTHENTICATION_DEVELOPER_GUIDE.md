# Authentication Developer Guide

## Table of Contents
1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Architecture](#architecture)
4. [Authentication Flow](#authentication-flow)
5. [Multi-Factor Authentication (2FA)](#multi-factor-authentication-2fa)
6. [Session Management](#session-management)
7. [Security Features](#security-features)
8. [Frontend Integration](#frontend-integration)
9. [API Reference](#api-reference)
10. [Testing](#testing)
11. [Troubleshooting](#troubleshooting)
12. [Security Best Practices](#security-best-practices)

---

## Overview

The SaaS Boilerplate authentication system is a comprehensive, enterprise-grade solution that provides:

- **JWT-based authentication** with access and refresh tokens
- **Multi-Factor Authentication (2FA)** using TOTP
- **Session management** with device tracking
- **Multi-tenant support** with deferred tenant creation
- **Password reset** with secure token-based flow
- **Role-based access control (RBAC)** with hierarchical permissions
- **Comprehensive security measures** including rate limiting and audit logging

### Key Features
- ✅ **Production-ready**: Working authentication system with Supabase REST API integration
- ✅ **Security-first**: Comprehensive security measures including rate limiting, input validation, and audit logging
- ✅ **Multi-tenant**: Complete tenant isolation with deferred creation on first login
- ✅ **2FA/MFA**: Full TOTP implementation with backup codes
- ✅ **Session tracking**: Device fingerprinting and session management
- ✅ **Frontend integration**: Complete UI with responsive design

---

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- Docker and Docker Compose
- Supabase account (or local Supabase instance)
- Redis instance

### Installation

1. **Clone and install dependencies:**
```bash
git clone <repository-url>
cd boss-boiler/boss03
npm install
```

2. **Set up environment variables:**
```bash
# Copy environment template
cp .env.example .env

# Configure your environment variables
cat > .env << EOF
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/saas_boilerplate"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="your-super-secret-jwt-key-min-32-chars"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Email (for password reset, verification)
SMTP_HOST="your-smtp-host"
SMTP_PORT=587
SMTP_USER="your-smtp-user"
SMTP_PASS="your-smtp-password"
SMTP_FROM="noreply@yourdomain.com"

# Frontend URL
FRONTEND_URL="http://localhost:3000"
EOF
```

3. **Start infrastructure services:**
```bash
# Start Postgres and Redis
docker-compose up -d postgres redis
```

4. **Run database migrations:**
```bash
cd apps/api
npx prisma migrate dev
npx prisma generate
```

5. **Start the application:**
```bash
# Terminal 1: Start API
cd apps/api
npm run dev

# Terminal 2: Start Web App
cd apps/web
npm run dev
```

6. **Access the application:**
- **Web App**: http://localhost:3000
- **API**: http://localhost:3001
- **API Docs**: http://localhost:3001/api/docs

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                       Frontend (Next.js)                        │
├─────────────────────────────────────────────────────────────────┤
│  • Authentication Pages (Login, Register, Forgot Password)      │
│  • Account Security Settings (2FA, Sessions)                    │
│  • AuthContext (React Context for auth state)                   │
│  • Auth Guards (Route protection)                               │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP/API Calls
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Backend (NestJS)                          │
├─────────────────────────────────────────────────────────────────┤
│  • AuthController (Registration, Login, Password Reset)         │
│  • MfaController (2FA Setup, Verification)                      │
│  • SessionController (Session Management)                       │
│  • JwtAuthGuard (Route Protection)                              │
│  • EnhancedAuthGuard (Role + Permission + MFA Checks)          │
└─────────────────────────────────────────────────────────────────┘
                                    │
                         ┌──────────┼──────────┐
                         ▼          ▼          ▼
                    ┌─────────┐ ┌─────────┐ ┌─────────┐
                    │ Prisma  │ │  Redis  │ │ Supabase│
                    │   ORM   │ │Sessions │ │Database │
                    └─────────┘ └─────────┘ └─────────┘
```

### Database Schema

```sql
-- Core authentication tables
User {
  id: String (UUID)
  email: String (unique)
  passwordHash: String
  firstName: String
  lastName: String
  emailVerified: Boolean
  twoFactorSecret: String (nullable)
  twoFactorEnabled: Boolean
  backupCodes: String[] (encrypted)
  tenantId: String (FK to Tenant)
  role: UserRole
  status: UserStatus
  createdAt: DateTime
  updatedAt: DateTime
}

Tenant {
  id: String (UUID)
  name: String
  domain: String (unique, nullable)
  createdAt: DateTime
  updatedAt: DateTime
}

Session {
  id: String (UUID)
  userId: String (FK to User)
  deviceFingerprint: String
  browserInfo: String
  ipAddress: String
  location: String (nullable)
  isTrusted: Boolean
  expiresAt: DateTime
  createdAt: DateTime
  lastActivityAt: DateTime
}

RefreshToken {
  id: String (UUID)
  userId: String (FK to User)
  tokenHash: String
  expiresAt: DateTime
  isRevoked: Boolean
  createdAt: DateTime
}
```

---

## Authentication Flow

### 1. User Registration

**Frontend Flow:**
```typescript
// apps/web/src/components/auth/SignUpForm.tsx
const handleSubmit = async (formData) => {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: formData.email,
      password: formData.password,
      firstName: formData.firstName,
      lastName: formData.lastName,
      tenantName: formData.organizationName, // Optional
      acceptTerms: formData.acceptTerms
    })
  });
};
```

**Backend Implementation:**
- **Endpoint**: `POST /api/auth/register`
- **Validation**: Email format, password strength, required fields
- **Process**: 
  1. Hash password using bcrypt
  2. Create user record (no tenant yet - deferred creation)
  3. Send email verification
  4. Return success message

### 2. User Login (First Time)

**Frontend Flow:**
```typescript
// apps/web/src/context/AuthContext.tsx
const login = async (email: string, password: string, rememberMe: boolean) => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  if (response.ok) {
    const data = await response.json();
    setUser(data.user);
    setToken(data.accessToken);
    // Store refresh token securely
    localStorage.setItem('refreshToken', data.refreshToken);
  }
};
```

**Backend Implementation:**
- **Endpoint**: `POST /api/auth/login`
- **Process**:
  1. Validate credentials
  2. Check if user has tenant - if not, create tenant and assign user as Owner
  3. Generate JWT access token (15min TTL) and refresh token (7 days TTL)
  4. Create session record with device fingerprinting
  5. Return tokens and user info

### 3. Token Refresh

**Automatic Refresh (Frontend):**
```typescript
// Automatic token refresh before expiry
useEffect(() => {
  const refreshTokens = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return;

    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });

    if (response.ok) {
      const data = await response.json();
      setToken(data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
    }
  };

  // Refresh 5 minutes before expiry
  const interval = setInterval(refreshTokens, 10 * 60 * 1000);
  return () => clearInterval(interval);
}, []);
```

### 4. Logout

**Frontend:**
```typescript
const logout = async () => {
  const refreshToken = localStorage.getItem('refreshToken');
  
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refreshToken })
  });

  // Clear local storage
  localStorage.removeItem('refreshToken');
  setUser(null);
  setToken(null);
};
```

---

## Multi-Factor Authentication (2FA)

### Setup Flow

1. **Setup MFA (Generate QR Code):**
```typescript
// Frontend
const setupMfa = async () => {
  const response = await fetch('/api/auth/mfa/setup', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ userId: user.id })
  });
  
  const { qrCode, backupCodes } = await response.json();
  // Display QR code for user to scan
};
```

2. **Enable MFA (Verify Code):**
```typescript
const enableMfa = async (verificationCode: string) => {
  await fetch('/api/auth/mfa/enable', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ token: verificationCode })
  });
};
```

### Login with MFA

When MFA is enabled, the login flow changes:

1. **Initial login** returns `requiresMfa: true`
2. **Frontend shows MFA input** instead of redirecting
3. **User enters 6-digit code** from authenticator app
4. **Verify MFA and complete login:**

```typescript
const verifyMfaAndLogin = async (userId: string, mfaCode: string) => {
  const response = await fetch('/api/auth/mfa/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, token: mfaCode })
  });
  
  if (response.ok) {
    const data = await response.json();
    // Complete login with tokens
    setUser(data.user);
    setToken(data.accessToken);
  }
};
```

---

## Session Management

### Session Tracking

Sessions include comprehensive device and security information:

```typescript
interface Session {
  id: string;
  deviceFingerprint: string;
  browserInfo: string; // "Chrome 91.0.4472.124"
  ipAddress: string;
  location?: string; // "New York, NY"
  isTrusted: boolean;
  isActive: boolean;
  isCurrent?: boolean; // Current session flag
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
}
```

### Managing Sessions

**View Active Sessions:**
```typescript
const getSessions = async () => {
  const response = await fetch('/api/sessions', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return response.json();
};
```

**Revoke Session:**
```typescript
const revokeSession = async (sessionId: string) => {
  await fetch(`/api/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reason: 'User revocation' })
  });
};
```

**Logout All Other Devices:**
```typescript
const logoutAllOthers = async () => {
  await fetch('/api/sessions/others', {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reason: 'Security cleanup' })
  });
};
```

---

## Security Features

### 1. Rate Limiting

**Login Protection:**
- 5 failed attempts per 15 minutes
- Progressive delays after failures
- IP and user-based tracking

**Password Reset Protection:**
- 3 requests per hour per email
- Global rate limiting for abuse prevention

### 2. Input Validation

**Password Requirements:**
- Minimum 8 characters
- Must contain uppercase, lowercase, number
- Special characters recommended
- Common password rejection

**Email Validation:**
- RFC 5322 compliant
- Domain validation
- Disposable email detection

### 3. Security Headers

Automatically applied security headers:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` (HTTPS only)

### 4. Audit Logging

All authentication events are logged:
- Login attempts (success/failure)
- Password changes
- MFA setup/disable
- Session creation/termination
- Permission changes

---

## Frontend Integration

### Auth Context Setup

```typescript
// apps/web/src/context/AuthContext.tsx
interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string, rememberMe?: boolean, mfaCode?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  register: (userData: RegisterData) => Promise<RegisterResult>;
  isAuthenticated: boolean;
  loading: boolean;
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Auto-load auth state on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('refreshToken');
    if (savedToken) {
      refreshAuth(savedToken);
    } else {
      setLoading(false);
    }
  }, []);

  // ... implementation
};
```

### Route Protection

```typescript
// apps/web/src/components/auth/AuthGuard.tsx
export const AuthGuard = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      // Store intended destination
      localStorage.setItem('redirectAfterLogin', pathname);
      router.push('/signin');
    }
  }, [isAuthenticated, loading, pathname, router]);

  if (loading) {
    return <LoadingSpinner />;
  }

  return isAuthenticated ? <>{children}</> : null;
};
```

### Protected Pages

```typescript
// apps/web/src/app/dashboard/layout.tsx
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <DashboardSidebar />
      <main>{children}</main>
    </AuthGuard>
  );
}
```

---

## API Reference

### Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/register` | User registration | No |
| POST | `/api/auth/login` | User login | No |
| POST | `/api/auth/logout` | User logout | Yes |
| POST | `/api/auth/refresh` | Refresh access token | No |
| GET | `/api/auth/profile` | Get user profile | Yes |
| POST | `/api/auth/forgot-password` | Request password reset | No |
| POST | `/api/auth/reset-password` | Reset password with token | No |

### MFA Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/mfa/setup` | Setup 2FA (get QR code) | Yes |
| POST | `/api/auth/mfa/enable` | Enable 2FA with verification | Yes |
| POST | `/api/auth/mfa/disable` | Disable 2FA | Yes |
| GET | `/api/auth/mfa/status` | Get MFA status | Yes |
| POST | `/api/auth/mfa/verify` | Verify MFA code | No |
| POST | `/api/auth/mfa/backup-codes/regenerate` | Regenerate backup codes | Yes |

### Session Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/sessions` | Get user sessions | Yes |
| GET | `/api/sessions/{id}` | Get specific session | Yes |
| DELETE | `/api/sessions/{id}` | Revoke session | Yes |
| DELETE | `/api/sessions/others` | Revoke all other sessions | Yes |
| GET | `/api/sessions/stats/summary` | Get session statistics | Yes |

---

## Testing

### Running Tests

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# Security tests
npm run test:security

# Coverage report
npm run test:coverage
```

### Test Structure

```
apps/api/src/modules/auth/
├── controllers/
│   ├── auth.controller.spec.ts      # Controller unit tests
│   ├── mfa.controller.spec.ts       # MFA controller tests
│   └── session.controller.spec.ts   # Session controller tests
├── services/
│   ├── auth.service.spec.ts         # Service unit tests
│   ├── mfa.service.spec.ts          # MFA service tests
│   └── session.service.spec.ts      # Session service tests
├── auth.e2e-spec.ts                 # Integration tests
└── auth.security.e2e-spec.ts        # Security tests
```

### Test Examples

**Unit Test Example:**
```typescript
describe('AuthService', () => {
  it('should hash password during registration', async () => {
    const password = 'TestPassword123!';
    const result = await authService.register({
      email: 'test@example.com',
      password,
      firstName: 'Test',
      lastName: 'User',
    });
    
    expect(result.password).not.toBe(password);
    expect(result.password).toMatch(/^\$2[aby]\$\d+\$/); // bcrypt hash
  });
});
```

**Security Test Example:**
```typescript
describe('Rate Limiting', () => {
  it('should block brute force login attempts', async () => {
    // Make 5 failed login attempts
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'wrong' })
        .expect(401);
    }
    
    // 6th attempt should be rate limited
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrong' })
      .expect(429);
  });
});
```

---

## Troubleshooting

### Common Issues

#### 1. "JWT token expired" Error

**Symptoms:** User gets logged out unexpectedly, API returns 401

**Solutions:**
- Check if refresh token is being stored correctly
- Verify automatic token refresh is working
- Check JWT expiry configuration
- Ensure clock synchronization between client/server

```typescript
// Debug token expiry
const payload = jwt.decode(token);
console.log('Token expires at:', new Date(payload.exp * 1000));
console.log('Current time:', new Date());
```

#### 2. CORS Issues

**Symptoms:** Network errors, preflight failures

**Solutions:**
- Check CORS configuration in backend
- Verify frontend URL is in allowed origins
- Ensure credentials are included in requests

```typescript
// Backend CORS config
app.enableCors({
  origin: ['http://localhost:3000', 'https://yourdomain.com'],
  credentials: true,
});
```

#### 3. 2FA QR Code Not Loading

**Symptoms:** QR code image doesn't display

**Solutions:**
- Check if QR code data is base64 encoded correctly
- Verify MFA service is properly configured
- Check authenticator app compatibility

```typescript
// Debug QR code
console.log('QR Code data:', qrCode.substring(0, 50) + '...');
console.log('Is base64:', qrCode.startsWith('data:image/'));
```

#### 4. Session Not Found Errors

**Symptoms:** Session operations fail with 404

**Solutions:**
- Check session ID format and validity
- Verify session hasn't expired
- Ensure user owns the session

```typescript
// Debug session
const sessions = await fetch('/api/sessions', {
  headers: { Authorization: `Bearer ${token}` }
});
console.log('Available sessions:', sessions);
```

### Debug Mode

Enable debug logging:

```bash
# Development
DEBUG=auth:* npm run dev

# Test environment
NODE_ENV=test DEBUG=auth:* npm run test:e2e
```

Debug output includes:
- Authentication attempts
- Token generation/validation
- Session creation/updates
- MFA operations
- Security events

---

## Security Best Practices

### 1. Environment Security

```bash
# Use strong secrets (minimum 32 characters)
JWT_SECRET="use-a-very-long-random-secret-at-least-32-characters"

# Use environment-specific configurations
NODE_ENV=production
DEBUG=false

# Secure database connections
DATABASE_URL="postgresql://user:password@host:5432/db?sslmode=require"
```

### 2. Token Security

```typescript
// Store refresh tokens securely
// ✅ Good: HttpOnly cookies (if possible)
// ✅ Acceptable: localStorage with XSS protection
// ❌ Bad: Regular cookies, sessionStorage for long-term tokens

// Set appropriate expiry times
const tokenConfig = {
  accessTokenExpiry: '15m',  // Short-lived
  refreshTokenExpiry: '7d',  // Longer but manageable
};
```

### 3. Password Security

```typescript
// Enforce strong password requirements
const passwordRequirements = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  rejectCommonPasswords: true,
};
```

### 4. Rate Limiting Configuration

```typescript
// Adjust based on your needs
const rateLimits = {
  login: { windowMs: 15 * 60 * 1000, max: 5 }, // 5 attempts per 15 minutes
  register: { windowMs: 60 * 60 * 1000, max: 3 }, // 3 registrations per hour
  passwordReset: { windowMs: 60 * 60 * 1000, max: 3 }, // 3 resets per hour
};
```

### 5. Monitoring & Alerting

```typescript
// Set up alerts for suspicious activities
const securityAlerts = {
  multipleFailedLogins: { threshold: 10, timeWindow: '5m' },
  unusualLocationLogin: { enabled: true, notifyUser: true },
  newDeviceLogin: { enabled: true, requireVerification: true },
  mfaDisabled: { enabled: true, requireAdminApproval: false },
};
```

---

## Conclusion

The authentication system is fully implemented and production-ready. Key features include:

- ✅ **Complete UI/UX**: Registration, login, forgot password, account settings
- ✅ **Robust Security**: 2FA, rate limiting, session management, audit logging
- ✅ **Developer-Friendly**: Comprehensive documentation, testing, and debugging tools
- ✅ **Scalable Architecture**: Multi-tenant support, horizontal scaling ready

For additional support or feature requests, please refer to the project repository or contact the development team.

---

**Next Steps:**
1. Review and customize security settings for your environment
2. Configure email providers for production
3. Set up monitoring and alerting
4. Implement additional authentication providers (SSO) if needed
5. Customize UI themes and branding

**Version:** 1.0.0  
**Last Updated:** September 28, 2025  
**Authors:** SaaS Boilerplate Development Team
