import AccountSecuritySettings from "@/components/user-profile/AccountSecuritySettings";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account Settings | SaaS Boilerplate",
  description: "Manage your account security settings, two-factor authentication, and active sessions",
};

export default function Settings() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          Account Settings
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage your account security settings and preferences.
        </p>
      </div>
      
      <AccountSecuritySettings />
    </div>
  );
}
