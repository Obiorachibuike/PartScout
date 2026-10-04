import { Suspense } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/components/layout/page-shell";
import { ResearchLauncher } from "@/components/research/research-launcher";
import { Skeleton } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Research a phone part",
  description:
    "Ask PartScout anything about phone part compatibility. Live web research, structured evidence, cited sources and evidence confidence — including honest “not enough evidence” answers.",
  alternates: { canonical: "/search" },
};

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; mode?: string; autorun?: string }>;
}) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 500) : "";

  return (
    <PageShell
      eyebrow="Live web research"
      title="Ask PartScout"
      description="Describe the device and the part in your own words. PartScout plans several targeted searches, reads the pages it finds and reports what the evidence actually supports."
      wide
    >
      <Suspense fallback={<Skeleton className="h-56 w-full" />}>
        <ResearchLauncher mode="auto" initialQuery={query} autoRun={params.autorun === "1"} />
      </Suspense>
    </PageShell>
  );
}
