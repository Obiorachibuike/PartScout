import { Suspense } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/components/layout/page-shell";
import { ResearchLauncher } from "@/components/research/research-launcher";
import { Skeleton } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Check part compatibility",
  description:
    "Check whether a specific part fits a specific phone. PartScout searches for evidence on both sides, lists any conflicting sources and tells you what to verify before installing.",
  alternates: { canonical: "/search/compatibility" },
};

export const dynamic = "force-dynamic";

export default async function CompatibilityPage() {
  return (
    <PageShell
      eyebrow="Check a pairing"
      title="Check compatibility"
      description="Use this when you already have the part in hand. PartScout researches that exact pairing, keeps sibling variants (4G/5G/regional SKUs) separate, and shows opposing evidence instead of hiding it."
      wide
    >
      <Suspense fallback={<Skeleton className="h-56 w-full" />}>
        <ResearchLauncher mode="compatibility" />
      </Suspense>
    </PageShell>
  );
}
