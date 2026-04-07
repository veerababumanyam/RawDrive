import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Login",
  description: "Login to your RawDrive account.",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-var(--navbar-height)-200px)] items-center justify-center bg-surface-sunken px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface-elevated p-8 shadow-glass">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary">Welcome Back</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Login to your RawDrive account
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
