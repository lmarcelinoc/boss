import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Forgot Password | SaaS Boilerplate",
  description: "Reset your password to regain access to your account",
};

export default function ForgotPassword() {
  return <ForgotPasswordForm />;
}
