import { Suspense } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/components/layout/page-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { Skeleton } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to PartScout to keep your research history and saved lookups.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <PageShell title="Sign in" description="Your research stays yours: history and saved lookups live on your account.">
      <Suspense fallback={<Skeleton className="mx-auto h-72 w-full max-w-md" />}>
        <AuthForm mode="login" />
      </Suspense>
    </PageShell>
  );
}
