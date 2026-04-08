import type { Metadata } from "next";
import { Suspense } from "react";
import { Camera } from "lucide-react";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Login | RawDrive",
  description: "Enter your details to access your RawDrive studio workspace.",
};

function LoginFormFallback() {
  return (
    <div className="mt-10 space-y-6">
      <div className="h-12 animate-pulse rounded-xl bg-white/6" />
      <div className="h-14 animate-pulse rounded-xl bg-white/8" />
      <div className="flex items-center gap-4">
        <div className="h-px flex-1 bg-white/10" />
        <div className="h-3 w-10 rounded bg-white/10" />
        <div className="h-px flex-1 bg-white/10" />
      </div>
      <div className="h-14 animate-pulse rounded-xl bg-white/6" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#0e0c1e] text-[#e8e2fc]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(26,23,45,0.95),_transparent_38%),radial-gradient(circle_at_top_right,_rgba(14,0,157,0.65),_transparent_36%),radial-gradient(circle_at_bottom_right,_rgba(85,22,190,0.42),_transparent_34%),linear-gradient(180deg,_#0e0c1e_0%,_#0b0918_100%)]" />
      <div className="pointer-events-none absolute bottom-[-10rem] right-[-7rem] h-[24rem] w-[24rem] rounded-full bg-[#9396ff]/15 blur-[120px]" />

      <div className="flex min-h-[100dvh] items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 shadow-[0_32px_80px_rgba(14,12,30,0.5)] backdrop-blur-[24px] md:p-10">
            <div className="mb-10 text-center">
              <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#a3a6ff] to-[#8455ef] shadow-lg shadow-[#a3a6ff]/20">
                <Camera className="h-8 w-8 text-white" />
              </div>
              <h1 className="font-headline text-3xl font-extrabold tracking-tight text-white">
                Welcome back
              </h1>
              <p className="mt-2 text-sm text-[#ada8c1]">
                Enter your details to access your studio
              </p>
            </div>

            <Suspense fallback={<LoginFormFallback />}>
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
