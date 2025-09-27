const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Redis = require('redis');
const { PrismaClient } = require('@prisma/client');
// Use crypto.randomUUID() instead of uuid package to avoid ES module issues
const { randomUUID } = require('crypto');

const app = express();
const prisma = new PrismaClient();
const PORT = 3001;

// JWT Configuration (following architecture.md)
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'supersecretrefreshkey';
const ACCESS_TOKEN_TTL = '15m'; // ~15 min TTL as per PRD
const REFRESH_TOKEN_TTL = '7d'; // ~7 days TTL as per PRD

// Redis client for session management (following architecture.md)
// Using Supabase infrastructure Redis
const redis = Redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
});

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err);
});

redis.on('connect', () => {
  console.log('✅ Redis connected for session management');
});

// Connect to Redis
(async () => {
  try {
    await redis.connect();
  } catch (err) {
    console.error('❌ Failed to connect to Redis:', err);
  }
})();

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Session management functions (following architecture.md)
async function createSession(userId, tenantId, deviceInfo = {}) {
  const sessionId = randomUUID();
  const sessionData = {
    userId,
    tenantId,
    deviceInfo,
    createdAt: new Date().toISOString(),
    lastAccessedAt: new Date().toISOString(),
  };
  
  // Store session in Redis with 7-day TTL
  await redis.setEx(`session:${sessionId}`, 7 * 24 * 60 * 60, JSON.stringify(sessionData));
  console.log(`✅ Session created: ${sessionId} for user ${userId}`);
  
  return sessionId;
}

async function getSession(sessionId) {
  const sessionData = await redis.get(`session:${sessionId}`);
  if (sessionData) {
    const session = JSON.parse(sessionData);
    // Update last accessed time
    session.lastAccessedAt = new Date().toISOString();
    await redis.setEx(`session:${sessionId}`, 7 * 24 * 60 * 60, JSON.stringify(session));
    return session;
  }
  return null;
}

async function revokeSession(sessionId) {
  await redis.del(`session:${sessionId}`);
  console.log(`✅ Session revoked: ${sessionId}`);
}

async function revokeAllUserSessions(userId) {
  // Get all session keys and revoke those belonging to this user
  const keys = await redis.keys('session:*');
  for (const key of keys) {
    const sessionData = await redis.get(key);
    if (sessionData) {
      const session = JSON.parse(sessionData);
      if (session.userId === userId) {
        await redis.del(key);
      }
    }
  }
  console.log(`✅ All sessions revoked for user ${userId}`);
}

// Generate tokens following architecture specifications
function generateAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

function generateRefreshToken(sessionId) {
  return jwt.sign({ sessionId }, REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_TTL });
}

// Health check endpoint
app.get('/health', async (req, res) => {
  let redisStatus = 'disconnected';
  try {
    await redis.ping();
    redisStatus = 'connected';
  } catch (err) {
    redisStatus = 'error';
  }

  res.json({
    status: 'ok',
    service: 'saas-boilerplate-redis-auth-api',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    database: 'PostgreSQL via Prisma',
    redis: redisStatus,
    architecture: 'Frontend → Backend API → Database + Redis Sessions'
  });
});

// Registration endpoint - only creates user, tenant created on first login (per architecture.md)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    console.log('📝 Registration attempt:', { email, firstName, lastName });

    // Basic validation
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user only - no tenant yet (per architecture: tenant created on first login)
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        isActive: true,
        emailVerified: true, // Simplified for demo
        status: 'active',
        // tenantId: null - will be set on first login
      }
    });

    console.log(`✅ User registered: ${email}`);

    res.json({
      message: 'User registered successfully',
      user: { 
        id: user.id, 
        email: user.email, 
        firstName: user.firstName, 
        lastName: user.lastName 
      },
      note: 'Tenant will be created automatically on first login'
    });
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login endpoint with Redis session management
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  console.log('🔐 Login attempt:', { email });

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      console.log('❌ Invalid credentials for:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    let tenant = null;
    let tenantId = user.tenantId;

    // If user has no tenant, create one on first login (per architecture.md)
    if (!user.tenantId) {
      console.log('🏢 Creating tenant for first-time login user:', email);
      
      const defaultTenantName = `${user.firstName}'s Organization`;
      const defaultTenantSlug = `tenant-${user.id.substring(0, 8)}`;

      tenant = await prisma.tenant.create({
        data: {
          name: defaultTenantName,
          slug: defaultTenantSlug,
          isActive: true,
        },
      });
      tenantId = tenant.id;

      // Update user with new tenantId
      await prisma.user.update({
        where: { id: user.id },
        data: { tenantId: tenant.id },
      });

      console.log(`✅ Tenant created: ${tenant.name} (${tenant.id})`);
    } else {
      // Fetch existing tenant
      tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
    }

    // Create Redis session (following architecture.md)
    const deviceInfo = {
      userAgent: req.headers['user-agent'] || 'unknown',
      ip: req.ip || req.connection.remoteAddress,
    };
    
    const sessionId = await createSession(user.id, tenantId, deviceInfo);

    // Generate JWT tokens with tenant context (per architecture.md)
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      tenantId: tenantId,
      sessionId, // Include session ID for validation
    });

    const refreshToken = generateRefreshToken(sessionId);

    console.log('✅ Login successful:', { 
      email, 
      sessionId: sessionId.substring(0, 8) + '...',
      tenantId 
    });

    res.status(200).json({
      message: 'Login successful',
      token: accessToken, // Access token (primary)
      refreshToken, // Refresh token for token renewal
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        tenantId: tenantId,
      },
      tenant: tenant ? { 
        id: tenant.id, 
        name: tenant.name, 
        slug: tenant.slug 
      } : undefined,
      session: {
        id: sessionId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Refresh token endpoint (following architecture.md)
app.post('/api/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    const { sessionId } = decoded;

    // Check if session exists in Redis
    const session = await getSession(sessionId);
    if (!session) {
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    // Get user and tenant data
    const user = await prisma.user.findUnique({ 
      where: { id: session.userId },
      include: { tenant: true }
    });

    if (!user || !user.isActive) {
      await revokeSession(sessionId);
      return res.status(401).json({ error: 'User account inactive' });
    }

    // Generate new access token
    const newAccessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      tenantId: session.tenantId,
      sessionId,
    });

    console.log('✅ Token refreshed for session:', sessionId.substring(0, 8) + '...');

    res.json({
      message: 'Token refreshed successfully',
      token: newAccessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        tenantId: session.tenantId,
      }
    });
  } catch (error) {
    console.error('❌ Token refresh error:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Logout endpoint (revokes session from Redis)
app.post('/api/auth/logout', async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(400).json({ error: 'Authorization header required' });
  }

  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (decoded.sessionId) {
      await revokeSession(decoded.sessionId);
    }

    console.log('✅ User logged out, session revoked');
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('❌ Logout error:', error);
    // Even if token is invalid, return success (logout is idempotent)
    res.json({ message: 'Logged out successfully' });
  }
});

// Logout all devices endpoint (revokes all user sessions)
app.post('/api/auth/logout-all', async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(400).json({ error: 'Authorization header required' });
  }

  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    
    await revokeAllUserSessions(decoded.userId);

    console.log('✅ All user sessions revoked');
    
    res.json({ message: 'Logged out from all devices successfully' });
  } catch (error) {
    console.error('❌ Logout all error:', error);
    res.status(500).json({ error: 'Logout all failed' });
  }
});

// Get user sessions (for admin/security purposes)
app.get('/api/auth/sessions', async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required' });
  }

  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get all sessions for this user
    const keys = await redis.keys('session:*');
    const userSessions = [];
    
    for (const key of keys) {
      const sessionData = await redis.get(key);
      if (sessionData) {
        const session = JSON.parse(sessionData);
        if (session.userId === decoded.userId) {
          userSessions.push({
            id: key.replace('session:', ''),
            deviceInfo: session.deviceInfo,
            createdAt: session.createdAt,
            lastAccessedAt: session.lastAccessedAt,
            isCurrent: session.sessionId === decoded.sessionId
          });
        }
      }
    }

    res.json({
      sessions: userSessions,
      total: userSessions.length
    });
  } catch (error) {
    console.error('❌ Get sessions error:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Redis-based Authentication API is running on: http://localhost:${PORT}`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
  console.log(`🔐 Auth Endpoints:`);
  console.log(`   POST http://localhost:${PORT}/api/auth/register`);
  console.log(`   POST http://localhost:${PORT}/api/auth/login`);
  console.log(`   POST http://localhost:${PORT}/api/auth/refresh`);
  console.log(`   POST http://localhost:${PORT}/api/auth/logout`);
  console.log(`   POST http://localhost:${PORT}/api/auth/logout-all`);
  console.log(`   GET  http://localhost:${PORT}/api/auth/sessions`);
  console.log(`📋 Architecture: Frontend → Backend API → Database + Redis Sessions`);
  console.log(`✅ Following architecture.md specifications:`);
  console.log(`   - JWT access tokens (15min TTL)`);
  console.log(`   - Refresh tokens (7 day TTL)`);
  console.log(`   - Redis session storage`);
  console.log(`   - Device-specific session management`);
  console.log(`   - Tenant creation on first login`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⏹️  Shutting down server...');
  try {
    await prisma.$disconnect();
    await redis.disconnect();
    console.log('✅ Database and Redis connections closed');
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
  }
  process.exit(0);
});
