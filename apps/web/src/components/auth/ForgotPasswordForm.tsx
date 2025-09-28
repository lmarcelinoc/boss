"use client";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { ChevronLeftIcon } from "@/icons";
import Link from "next/link";
import React, { useState } from "react";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('📝 ForgotPasswordForm: Form submission started', { email });
    
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      console.log('📝 ForgotPasswordForm: API response received', { 
        status: response.status,
        ok: response.ok 
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ ForgotPasswordForm: Password reset email sent successfully');
        setEmailSent(true);
        setSuccess("Password reset email sent! Please check your inbox and follow the instructions.");
      } else {
        const errorData = await response.json();
        console.error('❌ ForgotPasswordForm: API error:', errorData);
        
        if (response.status === 429) {
          setError("Too many password reset requests. Please try again later.");
        } else {
          setError(errorData.message || "Failed to send password reset email. Please try again.");
        }
      }
    } catch (error) {
      console.error('❌ ForgotPasswordForm: Unexpected error:', error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
      console.log('📝 ForgotPasswordForm: Form submission completed');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    // Clear error when user starts typing
    if (error) setError("");
  };

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
              {emailSent ? "Check Your Email" : "Forgot Password?"}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {emailSent 
                ? "We've sent a password reset link to your email address. Please check your inbox and follow the instructions to reset your password."
                : "Enter your email address and we'll send you a link to reset your password."
              }
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

          {!emailSent ? (
            <form onSubmit={handleSubmit}>
              <div className="space-y-6">
                <div>
                  <Label>
                    Email Address <span className="text-error-500">*</span>
                  </Label>
                  <Input
                    name="email"
                    type="email"
                    value={email}
                    onChange={handleInputChange}
                    placeholder="Enter your email address"
                    required
                  />
                </div>

                <div>
                  <Button
                    type="submit"
                    className="w-full"
                    size="sm"
                    disabled={loading}
                  >
                    {loading ? "Sending..." : "Send Reset Link"}
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg dark:bg-blue-900/20 dark:border-blue-800">
                <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
                  Email Sent Successfully
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  If an account with this email exists, you'll receive a password reset email shortly. 
                  The link will expire in 1 hour for security reasons.
                </p>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={() => {
                    setEmailSent(false);
                    setSuccess("");
                    setEmail("");
                  }}
                  variant="outline"
                  className="w-full"
                  size="sm"
                >
                  Send Another Reset Link
                </Button>
                
                <Link
                  href="/signin"
                  className="block w-full"
                >
                  <Button
                    variant="ghost"
                    className="w-full"
                    size="sm"
                  >
                    Back to Sign In
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {/* Help Text */}
          {!emailSent && (
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
          )}
        </div>
      </div>
    </div>
  );
}
