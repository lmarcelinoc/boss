/**
 * API Client for SaaS Boilerplate Backend
 * Handles HTTP requests to the NestJS backend
 */

import {
  ProfileResponse,
  ProfileCompletionResponse,
  CreateProfileRequest,
  UpdateProfileRequest,
  UploadAvatarResponse,
} from '../types/profile';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
  mfaCode?: string;
}

export interface LoginResponse {
  message: string;
  token: string;
  refreshToken: string; // Redis-based refresh token
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    tenantId?: string;
  };
  tenant?: {
    id: string;
    name: string;
    slug: string;
  };
  session?: {
    id: string;
    expiresAt: string;
  };
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  acceptTerms: boolean;
}

export interface RegisterResponse {
  message: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  note: string;
}

export interface ResetPasswordRequest {
  email: string;
}

export interface ResetPasswordResponse {
  message: string;
}

export interface ConfirmResetPasswordRequest {
  token: string;
  password: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    console.log(`🌐 API: Making request to ${url}`, {
      method: options.method || 'GET',
      hasBody: !!options.body,
      headers: options.headers
    });

    try {
      // Only set Content-Type for non-FormData requests
      const headers: Record<string, string> = { ...options.headers };
      if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(url, {
        ...options,
        headers,
      });

      console.log(`🌐 API: Response received`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        url: response.url
      });

      const data = await response.json();
      console.log(`🌐 API: Response data`, data);

      if (!response.ok) {
        console.error(`❌ API: Request failed`, {
          status: response.status,
          statusText: response.statusText,
          data
        });
        return {
          success: false,
          error: data.message || data.error || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      console.log(`✅ API: Request successful`);
      return {
        success: true,
        data,
      };
    } catch (error) {
      console.error(`❌ API: Network error for ${url}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
      };
    }
  }

  // Authentication endpoints
  async login(credentials: LoginRequest): Promise<ApiResponse<LoginResponse>> {
    console.log('🔐 API: Login request starting', {
      email: credentials.email,
      rememberMe: credentials.rememberMe,
      hasMfaCode: !!credentials.mfaCode
    });
    
    const response = await this.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    
    console.log('🔐 API: Login request completed', {
      success: response.success,
      hasData: !!response.data,
      error: response.error
    });
    
    return response;
  }

  async register(userData: RegisterRequest): Promise<ApiResponse<RegisterResponse>> {
    return this.request<RegisterResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async refreshToken(refreshToken: string): Promise<ApiResponse<{ message: string; token: string; user: any }>> {
    console.log('🔄 API: Refreshing token with Redis-based backend');
    return this.request<{ message: string; token: string; user: any }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  }

  async resetPassword(email: ResetPasswordRequest): Promise<ApiResponse<ResetPasswordResponse>> {
    return this.request<ResetPasswordResponse>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(email),
    });
  }

  async confirmResetPassword(data: ConfirmResetPasswordRequest): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>('/auth/confirm-reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async verifyEmail(token: string): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  async logout(): Promise<ApiResponse<{ message: string }>> {
    const token = this.getStoredToken();
    return this.request<{ message: string }>('/auth/logout', {
      method: 'POST',
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
  }

  // MFA endpoints
  async setupMfa(userId: string): Promise<ApiResponse<{
    secret: string;
    qrCode: string;
    backupCodes: string[];
  }>> {
    const token = this.getStoredToken();
    return this.request('/auth/mfa/setup', {
      method: 'POST',
      body: JSON.stringify({ userId }),
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
  }

  async enableMfa(mfaToken: string): Promise<ApiResponse<{ message: string }>> {
    const token = this.getStoredToken();
    return this.request('/auth/mfa/enable', {
      method: 'POST',
      body: JSON.stringify({ token: mfaToken }),
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
  }

  async verifyMfa(userId: string, mfaToken: string): Promise<ApiResponse<{
    isValid: boolean;
    message: string;
  }>> {
    return this.request('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ userId, token: mfaToken }),
    });
  }

  // Token management
  private getStoredToken(): string | null {
    if (typeof window === 'undefined') {
      console.log('🔒 API: getStoredToken called on server side, returning null');
      return null;
    }
    const token = localStorage.getItem('accessToken');
    console.log('🔒 API: getStoredToken retrieved', {
      hasToken: !!token,
      tokenPreview: token ? token.substring(0, 50) + '...' : 'null'
    });
    return token;
  }

  setTokens(accessToken: string, refreshToken: string): void {
    console.log('🔒 API: setTokens called', {
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      accessTokenPreview: accessToken ? accessToken.substring(0, 50) + '...' : 'null',
      isClient: typeof window !== 'undefined'
    });
    
    if (typeof window === 'undefined') {
      console.log('🔒 API: setTokens - window undefined, skipping storage');
      return;
    }
    
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    console.log('✅ API: Tokens stored in localStorage');
  }

  clearTokens(): void {
    console.log('🧹 API: clearTokens called', {
      isClient: typeof window !== 'undefined'
    });
    
    if (typeof window === 'undefined') return;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    console.log('✅ API: Tokens cleared from localStorage');
  }

  getAccessToken(): string | null {
    console.log('🔒 API: getAccessToken called');
    const token = this.getStoredToken();
    console.log('🔒 API: getAccessToken returning', {
      hasToken: !!token,
      tokenPreview: token ? token.substring(0, 30) + '...' : 'null'
    });
    return token;
  }

  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('refreshToken');
  }

  // Profile endpoints
  async getMyProfile(): Promise<ApiResponse<ProfileResponse>> {
    const token = this.getStoredToken();
    console.log('👤 API: Getting my profile');
    
    return this.request<ProfileResponse>('/profiles/me', {
      method: 'GET',
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
  }

  async createProfile(profileData: CreateProfileRequest): Promise<ApiResponse<ProfileResponse>> {
    const token = this.getStoredToken();
    console.log('👤 API: Creating profile', { 
      firstName: profileData.firstName, 
      lastName: profileData.lastName 
    });
    
    return this.request<ProfileResponse>('/profiles', {
      method: 'POST',
      body: JSON.stringify(profileData),
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
  }

  async updateProfile(profileData: UpdateProfileRequest): Promise<ApiResponse<ProfileResponse>> {
    const token = this.getStoredToken();
    console.log('👤 API: Updating profile', { 
      hasFirstName: !!profileData.firstName, 
      hasLastName: !!profileData.lastName 
    });
    
    return this.request<ProfileResponse>('/profiles/me', {
      method: 'PUT',
      body: JSON.stringify(profileData),
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
  }

  async getProfileCompletion(): Promise<ApiResponse<ProfileCompletionResponse>> {
    const token = this.getStoredToken();
    console.log('📊 API: Getting profile completion status');
    
    return this.request<ProfileCompletionResponse>('/profiles/me/completion', {
      method: 'GET',
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
  }

  async uploadAvatar(file: File): Promise<ApiResponse<ProfileResponse>> {
    const token = this.getStoredToken();
    console.log('📷 API: Uploading avatar', { 
      fileName: file.name, 
      fileSize: file.size, 
      fileType: file.type 
    });

    const formData = new FormData();
    formData.append('file', file);
    
    return this.request<ProfileResponse>('/profiles/me/avatar', {
      method: 'POST',
      body: formData,
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
  }

  async deleteAvatar(): Promise<ApiResponse<ProfileResponse>> {
    const token = this.getStoredToken();
    console.log('🗑️ API: Deleting avatar');
    
    return this.request<ProfileResponse>('/profiles/me/avatar', {
      method: 'DELETE',
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
  }

  async deleteProfile(): Promise<ApiResponse<void>> {
    const token = this.getStoredToken();
    console.log('🗑️ API: Deleting profile');
    
    return this.request<void>('/profiles/me', {
      method: 'DELETE',
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
  }

  // Helper method for authenticated requests
  private getAuthHeaders(): Record<string, string> {
    const token = this.getStoredToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}

// Export a singleton instance
export const apiClient = new ApiClient(API_BASE_URL);
export default apiClient;

