import { Suspense } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/components/layout/page-shell";
import { ResearchLauncher } from "@/components/research/research-launcher";
import { Skeleton } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Find compatible parts for a phone",
  description:
    "Enter a phone model and a part category. PartScout researches which screens, batteries, flexes, cameras and other parts are documented as compatible — with sources and variant warnings.",
  alternates: { canonical: "/search/phone" },
};

export const dynamic = "force-dynamic";

export default async function PhoneToPartsPage({
  searchParams,
}: {
  searchParams: Promise<{ part?: string; device?: string }>;
}) {
  const params = await searchParams;
  const part = typeof params.part === "string" ? params.part.slice(0, 40) : "";

  return (
    <PageShell
      eyebrow="Phone → parts"
      title="Find compatible parts"
      description="Start from the device. PartScout checks the manufacturer's model numbers, supplier listings and repair documentation for parts that are explicitly stated to fit — and shows which parts are model-specific."
      wide
    >
      <Suspense fallback={<Skeleton className="h-56 w-full" />}>
        <ResearchLauncher mode="phone" presetPartCategory={part} initialQuery={params.device ?? ""} />
      </Suspense>
    </PageShell>
  );
}
