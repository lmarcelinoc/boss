"use client";
import React, { useState, useEffect } from "react";
import Button from "@/components/ui/button/Button";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { useAuth } from "@/context/AuthContext";

interface MfaStatus {
  isEnabled: boolean;
  backupCodesCount?: number;
  hasBackupCodes?: boolean;
}

interface Session {
  id: string;
  deviceFingerprint?: string;
  browserInfo?: string;
  ipAddress?: string;
  location?: string;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  isTrusted: boolean;
  isSuspicious: boolean;
  isActive: boolean;
  isCurrent?: boolean;
}

export default function AccountSecuritySettings() {
  const { user, token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // MFA State
  const [mfaStatus, setMfaStatus] = useState<MfaStatus>({ isEnabled: false });
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [mfaSetupData, setMfaSetupData] = useState<{
    secret?: string;
    qrCode?: string;
    backupCodes?: string[];
  }>({});
  const [mfaVerificationCode, setMfaVerificationCode] = useState("");
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  
  // Sessions State
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionStats, setSessionStats] = useState({
    total: 0,
    activeCount: 0,
    trustedCount: 0
  });
  const [showAllSessions, setShowAllSessions] = useState(false);

  // Password Change State
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    if (user && token) {
      loadMfaStatus();
      loadSessions();
    }
  }, [user, token]);

  const apiCall = async (endpoint: string, options: RequestInit = {}) => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    return response.json();
  };

  const loadMfaStatus = async () => {
    try {
      const status = await apiCall('/auth/mfa/status');
      setMfaStatus(status);
    } catch (error) {
      console.error('Failed to load MFA status:', error);
    }
  };

  const loadSessions = async () => {
    try {
      const data = await apiCall('/sessions');
      setSessions(data.sessions || []);
      setSessionStats({
        total: data.total || 0,
        activeCount: data.activeCount || 0,
        trustedCount: data.trustedCount || 0
      });
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const setupMfa = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiCall('/auth/mfa/setup', {
        method: 'POST',
        body: JSON.stringify({ userId: user?.id }),
      });
      setMfaSetupData(data);
      setShowMfaSetup(true);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const enableMfa = async () => {
    if (!mfaVerificationCode) {
      setError("Please enter the verification code");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await apiCall('/auth/mfa/enable', {
        method: 'POST',
        body: JSON.stringify({ token: mfaVerificationCode }),
      });
      setSuccess("Two-factor authentication enabled successfully!");
      setShowMfaSetup(false);
      setMfaVerificationCode("");
      if (mfaSetupData.backupCodes) {
        setShowBackupCodes(true);
      }
      await loadMfaStatus();
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const disableMfa = async () => {
    if (!mfaVerificationCode) {
      setError("Please enter your current authentication code to disable 2FA");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await apiCall('/auth/mfa/disable', {
        method: 'POST',
        body: JSON.stringify({ token: mfaVerificationCode }),
      });
      setSuccess("Two-factor authentication disabled successfully!");
      setMfaVerificationCode("");
      await loadMfaStatus();
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const regenerateBackupCodes = async () => {
    if (!mfaVerificationCode) {
      setError("Please enter your current authentication code to regenerate backup codes");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await apiCall('/auth/mfa/backup-codes/regenerate', {
        method: 'POST',
        body: JSON.stringify({ token: mfaVerificationCode }),
      });
      setMfaSetupData(prev => ({ ...prev, backupCodes: data.backupCodes }));
      setShowBackupCodes(true);
      setSuccess("Backup codes regenerated successfully!");
      setMfaVerificationCode("");
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const revokeSession = async (sessionId: string) => {
    try {
      await apiCall(`/sessions/${sessionId}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: 'Manual revocation by user' }),
      });
      await loadSessions();
      setSuccess("Session revoked successfully!");
    } catch (error: any) {
      setError(error.message);
    }
  };

  const revokeAllOtherSessions = async () => {
    try {
      await apiCall('/sessions/others', {
        method: 'DELETE',
        body: JSON.stringify({ reason: 'User requested logout from all other devices' }),
      });
      await loadSessions();
      setSuccess("All other sessions have been revoked!");
    } catch (error: any) {
      setError(error.message);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getDeviceInfo = (session: Session) => {
    if (session.browserInfo) {
      return session.browserInfo;
    }
    return "Unknown Device";
  };

  const getLocationInfo = (session: Session) => {
    if (session.location) {
      return session.location;
    }
    if (session.ipAddress) {
      return session.ipAddress;
    }
    return "Unknown Location";
  };

  return (
    <div className="space-y-8">
      {/* Success/Error Messages */}
      {success && (
        <div className="p-4 text-sm text-green-700 bg-green-100 rounded-md dark:bg-green-900/20 dark:text-green-300">
          {success}
          <button 
            onClick={() => setSuccess("")}
            className="float-right text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200"
          >
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 text-sm text-red-700 bg-red-100 rounded-md dark:bg-red-900/20 dark:text-red-300">
          {error}
          <button 
            onClick={() => setError("")}
            className="float-right text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200"
          >
            ×
          </button>
        </div>
      )}

      {/* Two-Factor Authentication Section */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Two-Factor Authentication
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Add an extra layer of security to your account
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              mfaStatus.isEnabled 
                ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
            }`}>
              {mfaStatus.isEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>

        {!mfaStatus.isEnabled && !showMfaSetup && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Two-factor authentication is not enabled. Enable it now to secure your account.
            </p>
            <Button onClick={setupMfa} disabled={loading} size="sm">
              {loading ? "Setting up..." : "Enable Two-Factor Authentication"}
            </Button>
          </div>
        )}

        {showMfaSetup && mfaSetupData.qrCode && (
          <div className="space-y-4">
            <div>
              <h4 className="text-md font-medium text-gray-900 dark:text-white mb-2">
                Step 1: Scan QR Code
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
              </p>
              <div className="flex justify-center">
                <img 
                  src={mfaSetupData.qrCode} 
                  alt="QR Code for 2FA setup" 
                  className="border rounded-lg"
                />
              </div>
            </div>
            
            <div>
              <h4 className="text-md font-medium text-gray-900 dark:text-white mb-2">
                Step 2: Enter Verification Code
              </h4>
              <div className="max-w-xs">
                <Label>Authentication Code</Label>
                <Input
                  type="text"
                  value={mfaVerificationCode}
                  onChange={(e) => setMfaVerificationCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                />
              </div>
            </div>

            <div className="flex space-x-3">
              <Button onClick={enableMfa} disabled={loading} size="sm">
                {loading ? "Verifying..." : "Enable 2FA"}
              </Button>
              <Button 
                onClick={() => {
                  setShowMfaSetup(false);
                  setMfaVerificationCode("");
                  setMfaSetupData({});
                }} 
                variant="outline"
                size="sm"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {mfaStatus.isEnabled && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Two-factor authentication is enabled and protecting your account.
            </p>
            
            <div className="flex space-x-3">
              <div className="max-w-xs">
                <Label>Verification Code (to disable or regenerate)</Label>
                <Input
                  type="text"
                  value={mfaVerificationCode}
                  onChange={(e) => setMfaVerificationCode(e.target.value)}
                  placeholder="Enter current 6-digit code"
                  maxLength={6}
                />
              </div>
            </div>

            <div className="flex space-x-3">
              <Button 
                onClick={disableMfa} 
                disabled={loading} 
                variant="outline"
                size="sm"
              >
                {loading ? "Disabling..." : "Disable 2FA"}
              </Button>
              <Button 
                onClick={regenerateBackupCodes} 
                disabled={loading}
                variant="outline" 
                size="sm"
              >
                {loading ? "Generating..." : "Regenerate Backup Codes"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Backup Codes Modal */}
      {showBackupCodes && mfaSetupData.backupCodes && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-yellow-400">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Backup Codes
            </h3>
            <button 
              onClick={() => setShowBackupCodes(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              ×
            </button>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            Save these backup codes in a safe place. You can use them to access your account if you lose your phone.
          </p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {mfaSetupData.backupCodes.map((code, index) => (
              <div key={index} className="font-mono text-sm bg-gray-100 dark:bg-gray-700 p-2 rounded text-center">
                {code}
              </div>
            ))}
          </div>
          <p className="text-xs text-yellow-600 dark:text-yellow-400">
            ⚠️ These codes will only be shown once. Make sure to save them securely.
          </p>
        </div>
      )}

      {/* Active Sessions Section */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Active Sessions
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Manage your active sessions and devices
            </p>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {sessionStats.activeCount} active sessions
          </div>
        </div>

        <div className="space-y-4">
          {sessions.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No active sessions found.</p>
          ) : (
            <>
              {sessions.slice(0, showAllSessions ? sessions.length : 3).map((session) => (
                <div key={session.id} className="flex items-center justify-between p-4 border rounded-lg dark:border-gray-600">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {getDeviceInfo(session)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {getLocationInfo(session)} • Last active: {formatDate(session.lastActivityAt)}
                        </p>
                        {session.isCurrent && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 mt-1">
                            Current Session
                          </span>
                        )}
                        {session.isTrusted && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300 mt-1 ml-2">
                            Trusted
                          </span>
                        )}
                        {session.isSuspicious && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300 mt-1 ml-2">
                            Suspicious
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {!session.isCurrent && (
                    <Button
                      onClick={() => revokeSession(session.id)}
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-600 dark:hover:bg-red-900/20"
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              ))}

              {sessions.length > 3 && (
                <Button
                  onClick={() => setShowAllSessions(!showAllSessions)}
                  variant="ghost"
                  size="sm"
                  className="w-full"
                >
                  {showAllSessions ? "Show Less" : `Show All (${sessions.length})`}
                </Button>
              )}

              {sessions.length > 1 && (
                <div className="pt-4 border-t dark:border-gray-600">
                  <Button
                    onClick={revokeAllOtherSessions}
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-600 dark:hover:bg-red-900/20"
                  >
                    Logout All Other Devices
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Password Change Section */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Change Password
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Update your password to keep your account secure
            </p>
          </div>
        </div>

        {!showPasswordChange ? (
          <Button 
            onClick={() => setShowPasswordChange(true)} 
            variant="outline" 
            size="sm"
          >
            Change Password
          </Button>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Current Password</Label>
              <Input
                type="password"
                value={passwordData.currentPassword}
                onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                placeholder="Enter current password"
              />
            </div>
            <div>
              <Label>New Password</Label>
              <Input
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                placeholder="Enter new password"
                minLength={8}
              />
            </div>
            <div>
              <Label>Confirm New Password</Label>
              <Input
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                placeholder="Confirm new password"
                minLength={8}
              />
            </div>
            <div className="flex space-x-3">
              <Button onClick={() => {/* TODO: Implement password change */}} disabled={loading} size="sm">
                {loading ? "Changing..." : "Change Password"}
              </Button>
              <Button 
                onClick={() => {
                  setShowPasswordChange(false);
                  setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
                }} 
                variant="outline"
                size="sm"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
