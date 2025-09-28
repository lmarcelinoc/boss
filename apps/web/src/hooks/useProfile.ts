"use client";
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/services/api';
import {
  ProfileResponse,
  ProfileCompletionResponse,
  UpdateProfileRequest,
  CreateProfileRequest,
  ProfileState
} from '@/types/profile';

export function useProfile() {
  const [state, setState] = useState<ProfileState>({
    profile: null,
    completion: null,
    isLoading: true,
    error: null,
  });

  // Get current user profile
  const fetchProfile = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      console.log('🔄 useProfile: Fetching profile data...');
      
      const response = await apiClient.getMyProfile();
      
      if (response.success && response.data) {
        console.log('✅ useProfile: Profile fetched successfully');
        setState(prev => ({
          ...prev,
          profile: response.data!,
          isLoading: false,
        }));
        return response.data;
      } else {
        console.error('❌ useProfile: Failed to fetch profile:', response.error);
        setState(prev => ({
          ...prev,
          error: response.error || 'Failed to fetch profile',
          isLoading: false,
        }));
        return null;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      console.error('❌ useProfile: Error fetching profile:', error);
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
      }));
      return null;
    }
  }, []);

  // Get profile completion status
  const fetchCompletion = useCallback(async () => {
    try {
      console.log('📊 useProfile: Fetching completion data...');
      
      const response = await apiClient.getProfileCompletion();
      
      if (response.success && response.data) {
        console.log('✅ useProfile: Completion fetched successfully');
        setState(prev => ({
          ...prev,
          completion: response.data!,
        }));
        return response.data;
      } else {
        console.error('❌ useProfile: Failed to fetch completion:', response.error);
        return null;
      }
    } catch (error) {
      console.error('❌ useProfile: Error fetching completion:', error);
      return null;
    }
  }, []);

  // Create profile
  const createProfile = useCallback(async (profileData: CreateProfileRequest) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      console.log('➕ useProfile: Creating profile...');
      
      const response = await apiClient.createProfile(profileData);
      
      if (response.success && response.data) {
        console.log('✅ useProfile: Profile created successfully');
        setState(prev => ({
          ...prev,
          profile: response.data!,
          isLoading: false,
        }));
        
        // Fetch completion data after creation
        fetchCompletion();
        
        return response.data;
      } else {
        console.error('❌ useProfile: Failed to create profile:', response.error);
        setState(prev => ({
          ...prev,
          error: response.error || 'Failed to create profile',
          isLoading: false,
        }));
        return null;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create profile';
      console.error('❌ useProfile: Error creating profile:', error);
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
      }));
      return null;
    }
  }, [fetchCompletion]);

  // Update profile
  const updateProfile = useCallback(async (profileData: UpdateProfileRequest) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      console.log('📝 useProfile: Updating profile...');
      
      const response = await apiClient.updateProfile(profileData);
      
      if (response.success && response.data) {
        console.log('✅ useProfile: Profile updated successfully');
        setState(prev => ({
          ...prev,
          profile: response.data!,
          isLoading: false,
        }));
        
        // Refresh completion data after update
        fetchCompletion();
        
        return response.data;
      } else {
        console.error('❌ useProfile: Failed to update profile:', response.error);
        setState(prev => ({
          ...prev,
          error: response.error || 'Failed to update profile',
          isLoading: false,
        }));
        return null;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update profile';
      console.error('❌ useProfile: Error updating profile:', error);
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
      }));
      return null;
    }
  }, [fetchCompletion]);

  // Upload avatar
  const uploadAvatar = useCallback(async (file: File) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      console.log('📷 useProfile: Uploading avatar...');
      
      const response = await apiClient.uploadAvatar(file);
      
      if (response.success && response.data) {
        console.log('✅ useProfile: Avatar uploaded successfully');
        setState(prev => ({
          ...prev,
          profile: response.data!,
          isLoading: false,
        }));
        return response.data;
      } else {
        console.error('❌ useProfile: Failed to upload avatar:', response.error);
        setState(prev => ({
          ...prev,
          error: response.error || 'Failed to upload avatar',
          isLoading: false,
        }));
        return null;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload avatar';
      console.error('❌ useProfile: Error uploading avatar:', error);
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
      }));
      return null;
    }
  }, []);

  // Delete avatar
  const deleteAvatar = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      console.log('🗑️ useProfile: Deleting avatar...');
      
      const response = await apiClient.deleteAvatar();
      
      if (response.success && response.data) {
        console.log('✅ useProfile: Avatar deleted successfully');
        setState(prev => ({
          ...prev,
          profile: response.data!,
          isLoading: false,
        }));
        return response.data;
      } else {
        console.error('❌ useProfile: Failed to delete avatar:', response.error);
        setState(prev => ({
          ...prev,
          error: response.error || 'Failed to delete avatar',
          isLoading: false,
        }));
        return null;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete avatar';
      console.error('❌ useProfile: Error deleting avatar:', error);
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
      }));
      return null;
    }
  }, []);

  // Refresh both profile and completion data
  const refreshProfile = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const [profile, completion] = await Promise.all([
        fetchProfile(),
        fetchCompletion(),
      ]);
      
      return { profile, completion };
    } catch (error) {
      console.error('❌ useProfile: Error refreshing profile:', error);
      setState(prev => ({ ...prev, isLoading: false }));
      return { profile: null, completion: null };
    }
  }, [fetchProfile, fetchCompletion]);

  // Clear error state
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // Initial data fetch on mount
  useEffect(() => {
    console.log('🚀 useProfile: Component mounted, fetching initial data...');
    refreshProfile();
  }, [refreshProfile]);

  return {
    // State
    profile: state.profile,
    completion: state.completion,
    isLoading: state.isLoading,
    error: state.error,
    
    // Actions
    fetchProfile,
    fetchCompletion,
    createProfile,
    updateProfile,
    uploadAvatar,
    deleteAvatar,
    refreshProfile,
    clearError,
  };
}
