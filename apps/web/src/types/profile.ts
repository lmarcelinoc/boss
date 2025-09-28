/**
 * Profile Types for Frontend API Integration
 * Based on backend DTOs from /apps/api/src/modules/users/dto/profile.dto.ts
 */

export enum ProfilePrivacyLevel {
  PUBLIC = 'PUBLIC',
  TENANT_ONLY = 'TENANT_ONLY',
  PRIVATE = 'PRIVATE'
}

export enum ProfileCompletionStatus {
  INCOMPLETE = 'INCOMPLETE',
  PARTIAL = 'PARTIAL',
  COMPLETE = 'COMPLETE'
}

export interface CreateProfileRequest {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  bio?: string;
  phoneNumber?: string;
  jobTitle?: string;
  department?: string;
  location?: string;
  website?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  githubUrl?: string;
  privacyLevel?: ProfilePrivacyLevel;
  preferences?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface UpdateProfileRequest extends CreateProfileRequest {
  // Inherits all properties from CreateProfileRequest
  // All properties are optional for updates
}

export interface ProfileResponse {
  id: string;
  userId: string;
  tenantId?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  avatarFileKey?: string;
  phoneNumber?: string;
  jobTitle?: string;
  department?: string;
  location?: string;
  website?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  githubUrl?: string;
  privacyLevel: ProfilePrivacyLevel;
  completionStatus: ProfileCompletionStatus;
  preferences?: Record<string, any>;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileCompletionResponse {
  completionStatus: ProfileCompletionStatus;
  completionPercentage: number;
  missingFields: string[];
  totalRequiredFields: number;
  completedRequiredFields: number;
}

export interface UploadAvatarResponse {
  avatarUrl: string;
  profile: ProfileResponse;
}

// Frontend-specific types for UI components
export interface ProfileCardData {
  name: string;
  jobTitle: string;
  location: string;
  avatarUrl: string;
  socialLinks: {
    facebook?: string;
    twitter?: string;
    linkedin?: string;
    github?: string;
  };
}

export interface ProfileInfoData {
  personalInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
    bio: string;
  };
  professionalInfo: {
    jobTitle: string;
    department: string;
    website: string;
  };
}

export interface ProfileAddressData {
  country: string;
  city: string;
  postalCode: string;
  address: string;
}

// API Loading States
export interface ProfileState {
  profile: ProfileResponse | null;
  completion: ProfileCompletionResponse | null;
  isLoading: boolean;
  error: string | null;
}
