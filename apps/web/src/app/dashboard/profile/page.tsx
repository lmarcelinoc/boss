"use client";
import UserAddressCard from "@/components/user-profile/UserAddressCard";
import UserInfoCard from "@/components/user-profile/UserInfoCard";
import UserMetaCard from "@/components/user-profile/UserMetaCard";
import { useProfile } from "@/hooks/useProfile";
import React from "react";

// Loading Skeleton Component
function ProfileSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Page Title Skeleton */}
      <div className="mb-6">
        <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded"></div>
        <div className="mt-1 h-4 w-80 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>

      {/* Profile Content Skeleton */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-5 lg:p-6">
        <div className="space-y-4 sm:space-y-5 md:space-y-6">
          {/* Meta Card Skeleton */}
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
          {/* Info Card Skeleton */}
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
          {/* Address Card Skeleton */}
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
        </div>
      </div>
    </div>
  );
}

// Error Component
function ProfileError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Profile
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage your profile information and settings
        </p>
      </div>

      {/* Error Message */}
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20 sm:p-5 lg:p-6">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
              Failed to load profile
            </h3>
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">
              {error}
            </p>
          </div>
          <button
            onClick={onRetry}
            className="
              bg-red-100 hover:bg-red-200 dark:bg-red-800 dark:hover:bg-red-700
              text-red-800 dark:text-red-200
              px-3 py-1.5 rounded-md text-sm font-medium
              transition-colors duration-200
              focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
            "
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Profile() {
  const { 
    profile, 
    completion, 
    isLoading, 
    error, 
    refreshProfile, 
    clearError 
  } = useProfile();

  // Handle retry
  const handleRetry = () => {
    clearError();
    refreshProfile();
  };

  // Show loading state
  if (isLoading && !profile) {
    return <ProfileSkeleton />;
  }

  // Show error state
  if (error && !profile) {
    return <ProfileError error={error} onRetry={handleRetry} />;
  }

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Profile
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage your profile information and settings
        </p>
        
        {/* Profile Completion Status */}
        {completion && (
          <div className="mt-3 flex items-center space-x-2">
            <div className="flex-1 bg-gray-200 rounded-full h-2 dark:bg-gray-700">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${completion.completionPercentage}%` }}
              ></div>
            </div>
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {completion.completionPercentage}% complete
            </span>
          </div>
        )}
      </div>

      {/* Profile Content */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-5 lg:p-6">
        <div className="space-y-4 sm:space-y-5 md:space-y-6">
          <UserMetaCard profile={profile} isLoading={isLoading} />
          <UserInfoCard profile={profile} isLoading={isLoading} />
          <UserAddressCard profile={profile} isLoading={isLoading} />
        </div>
      </div>

      {/* Error Banner for non-critical errors */}
      {error && profile && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <svg className="h-4 w-4 text-orange-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 3.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 3.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-orange-800 dark:text-orange-200">
                {error}
              </span>
            </div>
            <button
              onClick={clearError}
              className="text-orange-600 hover:text-orange-800 dark:text-orange-300 dark:hover:text-orange-100"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
