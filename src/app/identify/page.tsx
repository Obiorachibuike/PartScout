import type { Metadata } from "next";
import { PageShell } from "@/components/layout/page-shell";
import { IdentifyFlow } from "@/components/identify/identify-flow";

export const metadata: Metadata = {
  title: "Identify a part from a photo",
  description:
    "Photograph a phone part and PartScout reads the printed part or model number with a vision model, then researches that identifier on the live web. You confirm the identifier before research runs.",
  alternates: { canonical: "/identify" },
};

export default function IdentifyPage() {
  return (
    <PageShell
      eyebrow="Identify a part"
      title="Read the part number from a photo"
      description="Vision reads identifiers printed on the part — it never decides compatibility. Confirm the number and PartScout researches it like any other query."
      wide
    >
      <IdentifyFlow />
    </PageShell>
  );
}
