const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Redis = require('redis');
const { randomUUID } = require('crypto');
const fetch = require('node-fetch'); // Add this if not available

const app = express();
const PORT = 3001;

// Environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'supersecretrefreshkey';
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '7d';

// Supabase REST API configuration
const SUPABASE_URL = 'http://localhost:8000';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';

// Redis client for session management
const redis = Redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
});

redis.on('error', (err) => console.error('❌ Redis connection error:', err));
redis.on('connect', () => console.log('✅ Redis connected for session management'));

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

// Supabase REST API helper functions
async function supabaseRequest(endpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1${endpoint}`;
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...options.headers
  };

  console.log(`🌐 Supabase API: ${options.method || 'GET'} ${url}`);

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json();
  
  if (!response.ok) {
    console.error('❌ Supabase API Error:', response.status, data);
    throw new Error(`Supabase API error: ${response.status} - ${JSON.stringify(data)}`);
  }

  console.log(`✅ Supabase API Success:`, data);
  return data;
}

// Session management functions
async function createSession(userId, tenantId, deviceInfo = {}) {
  const sessionId = randomUUID();
  const sessionData = {
    userId,
    tenantId,
    deviceInfo,
    createdAt: new Date().toISOString(),
  };
  const sessionKey = `session:${sessionId}`;
  await redis.set(sessionKey, JSON.stringify(sessionData), 'EX', parseInt(REFRESH_TOKEN_TTL) * 24 * 60 * 60);
  return sessionId;
}

async function getSession(sessionId) {
  const sessionData = await redis.get(`session:${sessionId}`);
  return sessionData ? JSON.parse(sessionData) : null;
}

async function deleteSession(sessionId) {
  await redis.del(`session:${sessionId}`);
}

// Helper functions
function generateId() {
  return randomUUID().replace(/-/g, '').substring(0, 25); // Mimic cuid format
}

// Health check endpoint
app.get('/health', async (req, res) => {
  let redisStatus = 'disconnected';
  let supabaseStatus = 'disconnected';
  
  try {
    await redis.ping();
    redisStatus = 'connected';
  } catch (error) {
    redisStatus = 'error';
  }

  try {
    await supabaseRequest('/');
    supabaseStatus = 'connected';
  } catch (error) {
    supabaseStatus = 'error';
  }

  res.json({
    status: 'ok',
    service: 'saas-boilerplate-supabase-rest-api',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    database: 'Supabase REST API',
    redis: redisStatus,
    supabase: supabaseStatus,
    architecture: 'Frontend → Backend API → Supabase REST API + Redis Sessions'
  });
});

// Registration endpoint
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
    const existingUsers = await supabaseRequest('/users', {
      method: 'GET',
      headers: { 'select': 'id,email' }
    });

    const existingUser = existingUsers.find(u => u.email === email);
    if (existingUser) {
      console.log('❌ User already exists:', email);
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const newUser = await supabaseRequest('/users', {
      method: 'POST',
      body: {
        id: generateId(),
        email,
        password: hashedPassword,
        firstName,
        lastName,
        isActive: true,
        emailVerified: true,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    });

    console.log(`✅ User registered: ${email}`);

    res.json({
      message: 'User registered successfully',
      user: {
        id: newUser[0].id,
        email: newUser[0].email,
        firstName: newUser[0].firstName,
        lastName: newUser[0].lastName,
      },
      note: 'Tenant will be created automatically on first login'
    });
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;
    console.log('🔐 Login attempt:', { email });

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const users = await supabaseRequest('/users', {
      method: 'GET',
      headers: { 'select': '*' }
    });

    const user = users.find(u => u.email === email);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      console.log('❌ Invalid credentials for:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    let tenant = null;
    let tenantId = user.tenantId;

    // Create tenant on first login if not already assigned
    if (!tenantId) {
      console.log('🏢 Creating tenant for first-time login user:', email);

      const defaultTenantName = `${user.firstName}'s Organization`;
      const defaultTenantSlug = `tenant-${user.id.substring(0, 8)}`;
      const newTenantId = generateId();

      const newTenant = await supabaseRequest('/tenants', {
        method: 'POST',
        body: {
          id: newTenantId,
          name: defaultTenantName,
          slug: defaultTenantSlug,
          settings: {},
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      });

      tenant = newTenant[0];
      tenantId = newTenant[0].id;

      // Update user with new tenantId
      await supabaseRequest(`/users?id=eq.${user.id}`, {
        method: 'PATCH',
        body: { tenantId: tenantId }
      });
      
      console.log(`✅ Tenant created: ${tenant.name} (${tenant.id})`);
    } else {
      // Get existing tenant
      const tenants = await supabaseRequest('/tenants', {
        method: 'GET',
        headers: { 'select': '*' }
      });
      tenant = tenants.find(t => t.id === tenantId);
    }

    // Create Redis session
    const deviceInfo = {
      userAgent: req.headers['user-agent'] || 'unknown',
      ip: req.ip || req.connection.remoteAddress,
    };

    const sessionId = await createSession(user.id, tenantId, deviceInfo);

    // Generate JWT Access Token
    const accessTokenPayload = {
      userId: user.id,
      email: user.email,
      tenantId: tenantId,
      firstName: user.firstName,
      lastName: user.lastName,
      sessionId: sessionId,
    };
    const accessToken = jwt.sign(accessTokenPayload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });

    // Generate Refresh Token and store in Redis
    const refreshTokenId = randomUUID();
    const refreshToken = jwt.sign({ tokenId: refreshTokenId, userId: user.id, sessionId: sessionId }, REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_TTL });

    const refreshExpirySeconds = parseInt(REFRESH_TOKEN_TTL) * 24 * 60 * 60;
    await redis.set(`refreshToken:${refreshTokenId}`, JSON.stringify({ userId: user.id, sessionId: sessionId }), 'EX', refreshExpirySeconds);
    
    console.log(`🔑 Refresh token stored in Redis for user ${user.id}, ID: ${refreshTokenId}`);

    res.json({
      message: 'Login successful',
      token: accessToken,
      refreshToken: refreshToken,
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
        slug: tenant.slug,
      } : undefined,
      session: {
        id: sessionId,
        expiresAt: new Date(Date.now() + refreshExpirySeconds * 1000).toISOString(),
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Refresh Token endpoint
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    const { tokenId, userId, sessionId } = decoded;

    // Check if refresh token exists in Redis
    const storedTokenData = await redis.get(`refreshToken:${tokenId}`);
    if (!storedTokenData) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    const { userId: storedUserId, sessionId: storedSessionId } = JSON.parse(storedTokenData);

    if (storedUserId !== userId || storedSessionId !== sessionId) {
      return res.status(401).json({ error: 'Invalid refresh token payload' });
    }

    // Check if session is still active
    const session = await getSession(sessionId);
    if (!session) {
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    // Get user to generate new access token
    const users = await supabaseRequest('/users', {
      method: 'GET',
      headers: { 'select': '*' }
    });
    const user = users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Generate new Access Token
    const accessTokenPayload = {
      userId: user.id,
      email: user.email,
      tenantId: user.tenantId,
      firstName: user.firstName,
      lastName: user.lastName,
      sessionId: sessionId,
    };
    const newAccessToken = jwt.sign(accessTokenPayload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });

    console.log(`🔄 Access token refreshed for user ${user.email}`);
    res.json({
      message: 'Token refreshed successfully',
      token: newAccessToken,
      refreshToken: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        tenantId: user.tenantId,
      },
      session: {
        id: sessionId,
        expiresAt: new Date(Date.now() + parseInt(ACCESS_TOKEN_TTL) * 1000).toISOString(),
      }
    });
  } catch (error) {
    console.error('❌ Refresh token error:', error);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Logout endpoint
app.post('/api/auth/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    const { tokenId, sessionId } = decoded;

    // Remove refresh token from Redis
    await redis.del(`refreshToken:${tokenId}`);
    await deleteSession(sessionId);
    console.log(`🗑️ Refresh token ${tokenId} and session ${sessionId} removed from Redis`);

    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Supabase REST Authentication API is running on: http://localhost:${PORT}`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
  console.log(`🔐 Auth Endpoints:`);
  console.log(`   POST http://localhost:${PORT}/api/auth/register`);
  console.log(`   POST http://localhost:${PORT}/api/auth/login`);
  console.log(`   POST http://localhost:${PORT}/api/auth/refresh`);
  console.log(`   POST http://localhost:${PORT}/api/auth/logout`);
  console.log(`📋 NEW Architecture: Frontend → Backend API → Supabase REST API + Redis Sessions`);
  console.log(`✅ Using Supabase REST API instead of direct database connection`);
  console.log(`✅ Bypassing all database pooler authentication issues`);
  console.log(`✅ Following architecture.md specifications with REST approach`);
});

