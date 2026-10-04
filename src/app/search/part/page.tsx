import { Suspense } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/components/layout/page-shell";
import { ResearchLauncher } from "@/components/research/research-launcher";
import { Skeleton } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Find phones that use a part",
  description:
    "Reverse lookup: give an OEM part number or part name and PartScout researches which phone models cite it, with the source of each claim and the variant it belongs to.",
  alternates: { canonical: "/search/part" },
};

export const dynamic = "force-dynamic";

export default async function PartToPhonesPage() {
  return (
    <PageShell
      eyebrow="Part → phones"
      title="Find compatible phones"
      description="Reverse lookup is a first-class flow. Paste an OEM part number (for example BN5A or GH82-31234A) or describe the part, and PartScout looks for the devices that explicitly cite it."
      wide
    >
      <Suspense fallback={<Skeleton className="h-56 w-full" />}>
        <ResearchLauncher mode="part" />
      </Suspense>
    </PageShell>
  );
}
