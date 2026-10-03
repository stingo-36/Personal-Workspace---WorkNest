import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { safeCallbackUrl } from "@/components/auth/safe-callback-url";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  // `src/proxy.ts` bounces protected routes here with the original path.
  const { callbackUrl } = await searchParams;

  return (
    <AuthShell variant="login">
      <LoginForm callbackUrl={safeCallbackUrl(callbackUrl)} />
    </AuthShell>
  );
}
