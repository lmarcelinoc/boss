'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import apiClient, { LoginResponse } from '@/services/api';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tenantId?: string;
  roles: string[];
  twoFactorEnabled: boolean;
  emailVerified: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberMe?: boolean, mfaCode?: string) => Promise<{
    success: boolean;
    requiresMfa?: boolean;
    error?: string;
  }>;
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    acceptTerms: boolean;
  }) => Promise<{ success: boolean; error?: string; message?: string }>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const isAuthenticated = !!user;

  // Initialize auth state on mount
  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    console.log('🚀 AuthContext: Initializing authentication...');
    setLoading(true);
    
    try {
      const token = apiClient.getAccessToken();
      console.log('🚀 AuthContext: Checking stored token', {
        hasToken: !!token,
        tokenPreview: token ? token.substring(0, 50) + '...' : 'none'
      });
      
      if (token) {
        console.log('🚀 AuthContext: Token found, parsing...');
        const tokenPayload = parseJWT(token);
        console.log('🚀 AuthContext: Token payload', tokenPayload);
        
        if (tokenPayload && tokenPayload.exp * 1000 > Date.now()) {
          console.log('✅ AuthContext: Token is valid, setting user from token');
          const user = {
            id: tokenPayload.userId || tokenPayload.sub,
            email: tokenPayload.email,
            firstName: tokenPayload.firstName || '',
            lastName: tokenPayload.lastName || '',
            tenantId: tokenPayload.tenantId,
            roles: tokenPayload.roles || [],
            twoFactorEnabled: tokenPayload.twoFactorEnabled || false,
            emailVerified: tokenPayload.emailVerified || false,
          };
          console.log('🚀 AuthContext: Setting user from stored token:', user);
          setUser(user);
        } else {
          console.log('❌ AuthContext: Token is expired, attempting refresh');
          await attemptTokenRefresh();
        }
      } else {
        console.log('ℹ️ AuthContext: No stored token found');
      }
    } catch (error) {
      console.error('❌ AuthContext: Failed to initialize auth:', error);
      // Clear invalid tokens
      apiClient.clearTokens();
    } finally {
      setLoading(false);
      console.log('🚀 AuthContext: Auth initialization complete');
    }
  };

  const attemptTokenRefresh = async () => {
    console.log('🔄 AuthContext: Attempting token refresh...');
    
    try {
      const refreshToken = apiClient.getRefreshToken();
      if (!refreshToken) {
        console.log('❌ AuthContext: No refresh token available');
        apiClient.clearTokens();
        setUser(null);
        return;
      }

      console.log('🔄 AuthContext: Found refresh token, calling refresh API...');
      const response = await apiClient.refreshToken(refreshToken);

      if (response.success && response.data) {
        console.log('✅ AuthContext: Token refresh successful');
        
        // Store the new access token (refresh token stays the same)
        apiClient.setTokens(response.data.token, refreshToken);
        
        // Parse the new token to update user state
        const tokenPayload = parseJWT(response.data.token);
        if (tokenPayload) {
          const user = {
            id: tokenPayload.userId || tokenPayload.sub,
            email: tokenPayload.email,
            firstName: tokenPayload.firstName || '',
            lastName: tokenPayload.lastName || '',
            tenantId: tokenPayload.tenantId,
            roles: [],
            twoFactorEnabled: false,
            emailVerified: true,
          };
          console.log('🔄 AuthContext: User state updated after token refresh:', user);
          setUser(user);
        } else {
          throw new Error('Failed to parse new access token');
        }
      } else {
        console.error('❌ AuthContext: Token refresh failed:', response.error);
        apiClient.clearTokens();
        setUser(null);
      }
    } catch (error) {
      console.error('❌ AuthContext: Token refresh error:', error);
      apiClient.clearTokens();
      setUser(null);
    }
  };

  const login = async (
    email: string, 
    password: string, 
    rememberMe = false, 
    mfaCode?: string
  ) => {
    console.log('🔐 AuthContext: Starting login process', { email, rememberMe });
    
    try {
      console.log('🔐 AuthContext: Calling API login...');
      const response = await apiClient.login({
        email,
        password,
        rememberMe,
        mfaCode,
      });

      console.log('🔐 AuthContext: API response received', {
        success: response.success,
        hasData: !!response.data,
        error: response.error,
        dataKeys: response.data ? Object.keys(response.data) : 'no data'
      });

      if (response.success && response.data) {
        console.log('🔐 AuthContext: Login API successful, processing response');
        console.log('🔐 AuthContext: Response data structure:', response.data);

        // Check if we have a token in the response
        if (response.data.token) {
          console.log('🔐 AuthContext: Token found, storing and parsing');
          
          // Store JWT tokens (access + refresh)
          const refreshToken = response.data.refreshToken || '';
          apiClient.setTokens(response.data.token, refreshToken);
          console.log('🔐 AuthContext: Tokens stored in API client', {
            hasAccessToken: !!response.data.token,
            hasRefreshToken: !!refreshToken
          });
          
          // Parse JWT to get user info
          const tokenPayload = parseJWT(response.data.token);
          console.log('🔐 AuthContext: Parsed token payload:', tokenPayload);
          
          if (tokenPayload) {
            const user = {
              id: tokenPayload.userId || tokenPayload.sub,
              email: tokenPayload.email,
              firstName: tokenPayload.firstName || '',
              lastName: tokenPayload.lastName || '',
              tenantId: tokenPayload.tenantId,
              roles: [],
              twoFactorEnabled: false,
              emailVerified: true,
            };
            console.log('🔐 AuthContext: Setting user state:', user);
            setUser(user);
            
            console.log('✅ AuthContext: Login successful, user set');
            return { success: true };
          } else {
            console.error('❌ AuthContext: Failed to parse JWT token');
            return {
              success: false,
              error: 'Invalid token received - could not parse JWT',
            };
          }
        } else {
          console.error('❌ AuthContext: No token in API response');
          console.log('🔐 AuthContext: Available response keys:', Object.keys(response.data));
          return {
            success: false,
            error: 'No authentication token received from server',
          };
        }
      } else {
        console.error('❌ AuthContext: API response failed or no data');
        return {
          success: false,
          error: response.error || 'Login failed',
        };
      }
    } catch (error) {
      console.error('❌ AuthContext: Login error caught:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
      };
    }
  };

  const register = async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    acceptTerms: boolean;
  }) => {
    try {
      // Remove acceptTerms from API call as backend doesn't expect it
      const { acceptTerms, ...registerData } = data;
      const response = await apiClient.register(registerData);

      if (response.success) {
        return {
          success: true,
          message: response.data?.message || 'Registration successful! You can now sign in.',
        };
      } else {
        return {
          success: false,
          error: response.error || 'Registration failed',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
      };
    }
  };

  const logout = async () => {
    try {
      await apiClient.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      apiClient.clearTokens();
      setUser(null);
      router.push('/signin');
    }
  };

  const refreshAuth = async () => {
    await initializeAuth();
  };

  const contextValue: AuthContextType = {
    user,
    loading,
    isAuthenticated,
    login,
    register,
    logout,
    refreshAuth,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Helper function to parse JWT token
function parseJWT(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Error parsing JWT:', error);
    return null;
  }
}

