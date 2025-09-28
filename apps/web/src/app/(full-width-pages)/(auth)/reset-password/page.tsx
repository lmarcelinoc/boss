import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset Password | SaaS Boilerplate",
  description: "Create a new password for your account",
};

export default function ResetPassword() {
  return <ResetPasswordForm />;
}
