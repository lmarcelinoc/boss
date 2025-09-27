'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  redirectTo?: string;
  requireRoles?: string[];
}

/**
 * AuthGuard component that protects routes from unauthenticated access
 * Following SaaS architecture best practices from architectuer.md
 */
export default function AuthGuard({
  children,
  fallback,
  redirectTo = '/signin',
  requireRoles = []
}: AuthGuardProps) {
  const { user, loading, isAuthenticated } = useAuth();
  const router = useRouter();

  console.log('🛡️ AuthGuard: State check', {
    loading,
    isAuthenticated,
    hasUser: !!user,
    userId: user?.id,
    userEmail: user?.email,
    requireRoles,
    currentPath: typeof window !== 'undefined' ? window.location.pathname : 'server'
  });

  useEffect(() => {
    console.log('🛡️ AuthGuard: useEffect triggered', {
      loading,
      isAuthenticated,
      hasUser: !!user
    });

    if (!loading) {
      if (!isAuthenticated) {
        console.log('🛡️ AuthGuard: User not authenticated, redirecting to signin');
        
        // Store the current path for redirect after login
        const currentPath = window.location.pathname + window.location.search;
        if (currentPath !== '/signin' && currentPath !== '/signup') {
          console.log('🛡️ AuthGuard: Storing redirect path:', currentPath);
          localStorage.setItem('redirectAfterLogin', currentPath);
        }
        
        console.log('🔄 AuthGuard: Redirecting to:', redirectTo);
        router.push(redirectTo);
        return;
      }

      console.log('✅ AuthGuard: User is authenticated');

      // Check role requirements if specified
      if (requireRoles.length > 0 && user) {
        const hasRequiredRole = requireRoles.some(role => user.roles.includes(role));
        console.log('🛡️ AuthGuard: Role check', {
          requireRoles,
          userRoles: user.roles,
          hasRequiredRole
        });
        
        if (!hasRequiredRole) {
          console.log('❌ AuthGuard: Insufficient permissions, redirecting to unauthorized');
          router.push('/unauthorized');
          return;
        }
      }

      console.log('✅ AuthGuard: All checks passed, rendering children');
    }
  }, [user, loading, isAuthenticated, router, redirectTo, requireRoles]);

  // Show loading state
  if (loading) {
    if (fallback) {
      return <>{fallback}</>;
    }
    
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  // Show nothing while redirecting
  if (!isAuthenticated) {
    return null;
  }

  // Check role requirements
  if (requireRoles.length > 0 && user) {
    const hasRequiredRole = requireRoles.some(role => user.roles.includes(role));
    if (!hasRequiredRole) {
      return null; // Will redirect via useEffect
    }
  }

  // User is authenticated and has required roles
  return <>{children}</>;
}
