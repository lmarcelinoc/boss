const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();

// CORS configuration for frontend
const corsOptions = {
  origin: 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

// Mock JWT secret
const JWT_SECRET = 'mock-jwt-secret-for-testing-only';

// Mock user data
const mockUsers = {
  'crm@crm.com': {
    id: 'user-123',
    email: 'crm@crm.com',
    firstName: 'CRM',
    lastName: 'User',
    password: 'Welcome01', // In real app this would be hashed
    tenantId: 'tenant-123',
    status: 'active'
  }
};

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'mock-auth-api',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Mock login endpoint
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  console.log(`Login attempt for: ${email}`);
  
  // Check if user exists and password matches
  const user = mockUsers[email];
  if (!user || user.password !== password) {
    console.log(`❌ Login failed for: ${email}`);
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    });
  }
  
  // Generate JWT tokens
  const accessToken = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: 'owner'
    },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
  
  const refreshToken = jwt.sign(
    {
      sub: user.id,
      tokenId: 'refresh-123'
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  
  console.log(`✅ Login successful for: ${email}`);
  
  res.json({
    accessToken,
    refreshToken,
    expiresIn: 900, // 15 minutes
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: 'owner',
      status: user.status,
      tenantId: user.tenantId,
      avatar: null
    }
  });
});

// Mock register endpoint
app.post('/api/auth/register', (req, res) => {
  const { email, password, firstName, lastName } = req.body;
  
  console.log(`Registration attempt for: ${email}`);
  
  // Check if user already exists
  if (mockUsers[email]) {
    console.log(`❌ Registration failed - user exists: ${email}`);
    return res.status(400).json({
      success: false,
      error: 'User already exists'
    });
  }
  
  // Create new user
  const newUser = {
    id: `user-${Date.now()}`,
    email,
    firstName,
    lastName,
    password, // In real app this would be hashed
    tenantId: `tenant-${Date.now()}`,
    status: 'active'
  };
  
  mockUsers[email] = newUser;
  
  console.log(`✅ Registration successful for: ${email}`);
  
  res.json({
    success: true,
    message: 'User registered successfully',
    user: {
      id: newUser.id,
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      role: 'owner',
      status: newUser.status,
      tenantId: newUser.tenantId
    }
  });
});

// Mock user profile endpoint
app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'No token provided'
    });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = Object.values(mockUsers).find(u => u.id === decoded.sub);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: 'owner',
        status: user.status,
        tenantId: user.tenantId,
        avatar: null
      }
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
});

// Mock logout endpoint
app.post('/api/auth/logout', (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🚀 Mock Authentication API is running on: http://localhost:${PORT}`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
  console.log(`🔐 Auth Endpoints:`);
  console.log(`   POST http://localhost:${PORT}/api/auth/register`);
  console.log(`   POST http://localhost:${PORT}/api/auth/login`);
  console.log(`   GET  http://localhost:${PORT}/api/auth/me`);
  console.log(`   POST http://localhost:${PORT}/api/auth/logout`);
  console.log(`📝 Test Credentials: crm@crm.com / Welcome01`);
});
