import { Suspense } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/components/layout/page-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { Skeleton } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create a PartScout account to save research, keep history and share reports with your workshop.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <PageShell
      title="Create an account"
      description="Research works without an account — signing in adds history, saved lookups and shareable reports."
    >
      <Suspense fallback={<Skeleton className="mx-auto h-72 w-full max-w-md" />}>
        <AuthForm mode="register" />
      </Suspense>
    </PageShell>
  );
}
