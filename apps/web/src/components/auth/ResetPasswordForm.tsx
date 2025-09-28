"use client";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { ChevronLeftIcon, EyeCloseIcon, EyeIcon } from "@/icons";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useState, useEffect } from "react";

export default function ResetPasswordForm() {
  const [formData, setFormData] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [validToken, setValidToken] = useState<boolean | null>(null);
  
  const searchParams = useSearchParams();
  const router = useRouter();

  // Extract token from URL parameters
  useEffect(() => {
    const tokenParam = searchParams?.get('token');
    console.log('📝 ResetPasswordForm: Token from URL:', tokenParam);
    
    if (tokenParam) {
      setToken(tokenParam);
      // We'll validate the token when user submits the form
      setValidToken(true);
    } else {
      console.warn('❌ ResetPasswordForm: No token found in URL');
      setValidToken(false);
      setError("Invalid or missing reset token. Please request a new password reset link.");
    }
  }, [searchParams]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (error) setError("");
  };

  const validatePasswords = () => {
    if (formData.newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return false;
    }
    
    if (formData.newPassword !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return false;
    }
    
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('📝 ResetPasswordForm: Form submission started');
    
    if (!token || !validToken) {
      setError("Invalid or missing reset token. Please request a new password reset link.");
      return;
    }

    if (!validatePasswords()) {
      return;
    }
    
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          newPassword: formData.newPassword,
        }),
      });

      console.log('📝 ResetPasswordForm: API response received', { 
        status: response.status,
        ok: response.ok 
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ ResetPasswordForm: Password reset successful');
        setSuccess("Password reset successfully! Redirecting to sign in...");
        
        // Redirect to sign in after 3 seconds
        setTimeout(() => {
          router.push('/signin?message=password-reset-success');
        }, 3000);
      } else {
        const errorData = await response.json();
        console.error('❌ ResetPasswordForm: API error:', errorData);
        
        if (response.status === 400) {
          setError("Invalid or expired reset token. Please request a new password reset link.");
        } else if (response.status === 429) {
          setError("Too many password reset attempts. Please try again later.");
        } else {
          setError(errorData.message || "Failed to reset password. Please try again.");
        }
      }
    } catch (error) {
      console.error('❌ ResetPasswordForm: Unexpected error:', error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
      console.log('📝 ResetPasswordForm: Form submission completed');
    }
  };

  // Show error message if no valid token
  if (validToken === false) {
    return (
      <div className="flex flex-col flex-1 lg:w-1/2 w-full">
        <div className="w-full max-w-md sm:pt-10 mx-auto mb-5">
          <Link
            href="/forgot-password"
            className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          >
            <ChevronLeftIcon />
            Request new reset link
          </Link>
        </div>
        
        <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
          <div>
            <div className="mb-5 sm:mb-8">
              <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
                Invalid Reset Link
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                This password reset link is invalid or has expired. Please request a new one.
              </p>
            </div>

            <div className="mb-4 p-3 text-sm text-red-700 bg-red-100 rounded-md dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>

            <div className="space-y-3">
              <Link href="/forgot-password" className="block w-full">
                <Button className="w-full" size="sm">
                  Request New Reset Link
                </Button>
              </Link>
              
              <Link href="/signin" className="block w-full">
                <Button variant="outline" className="w-full" size="sm">
                  Back to Sign In
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full">
      <div className="w-full max-w-md sm:pt-10 mx-auto mb-5">
        <Link
          href="/signin"
          className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ChevronLeftIcon />
          Back to sign in
        </Link>
      </div>
      
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              Reset Your Password
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enter a new password for your account. Make sure it's at least 8 characters long.
            </p>
          </div>

          {/* Success Message */}
          {success && (
            <div className="mb-4 p-3 text-sm text-green-700 bg-green-100 rounded-md dark:bg-green-900/20 dark:text-green-300">
              {success}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 text-sm text-red-700 bg-red-100 rounded-md dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="space-y-6">
              <div>
                <Label>
                  New Password <span className="text-error-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    name="newPassword"
                    type={showPassword ? "text" : "password"}
                    value={formData.newPassword}
                    onChange={handleInputChange}
                    placeholder="Enter new password"
                    required
                    minLength={8}
                  />
                  <span
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                  >
                    {showPassword ? (
                      <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                    ) : (
                      <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
                    )}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Password must be at least 8 characters long
                </p>
              </div>

              <div>
                <Label>
                  Confirm New Password <span className="text-error-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    placeholder="Confirm new password"
                    required
                    minLength={8}
                  />
                  <span
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                  >
                    {showConfirmPassword ? (
                      <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                    ) : (
                      <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
                    )}
                  </span>
                </div>
              </div>

              <div>
                <Button
                  type="submit"
                  className="w-full"
                  size="sm"
                  disabled={loading}
                >
                  {loading ? "Resetting Password..." : "Reset Password"}
                </Button>
              </div>
            </div>
          </form>

          {/* Help Text */}
          <div className="mt-5">
            <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
              Remember your password?{" "}
              <Link
                href="/signin"
                className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
              >
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
