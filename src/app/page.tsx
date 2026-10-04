import Link from "next/link";
import { ArrowRight, CircleCheck } from "lucide-react";
import { CapabilityBanner } from "@/components/common/capability-banner";
import { HeroSearch } from "@/components/home/hero-search";
import { SearchModes } from "@/components/home/search-modes";
import { SupportedParts } from "@/components/home/supported-parts";
import { HowItWorks } from "@/components/home/how-it-works";
import { TrustSection } from "@/components/home/trust-section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { appConfig } from "@/lib/config";

export const metadata = {
  alternates: { canonical: "/" },
};

export default function HomePage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: appConfig.appName,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description:
          "Live-web compatibility research for phone repair parts. Answers cite published evidence, and unsupported conclusions are reported as unknown.",
        url: appConfig.appUrl,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description: "Free tier with daily research limits; paid plans for technicians.",
        },
        featureList: [
          "Phone to parts compatibility research",
          "Part to phones reverse lookup",
          "OEM part number research",
          "Photo identification of parts",
          "Evidence confidence scoring",
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "Does PartScout guarantee that a part will fit?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "No. PartScout reports evidence confidence from public sources, not a laboratory guarantee. Always verify the part against the device before installing.",
            },
          },
          {
            "@type": "Question",
            name: "Where does PartScout get its compatibility data?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "From live web research at the moment you ask: licensed search APIs surface pages, PartScout extracts short evidence claims and cites every source. There is no hand-maintained compatibility database.",
            },
          },
        ],
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <CapabilityBanner />

      <section className="relative overflow-hidden">
        <div className="ps-grid-bg absolute inset-0 -z-10 opacity-70" aria-hidden />
        <div className="ps-glow absolute inset-0 -z-10 opacity-60" aria-hidden />
        <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-14 sm:px-6 sm:pt-20">
          <div className="grid items-start gap-10 lg:grid-cols-[1.35fr_1fr]">
            <div>
              <Badge tone="primary" className="mb-4">
                Live web research · no compatibility database
              </Badge>
              <h1 className="max-w-2xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
                Find the right part.
                <span className="block bg-gradient-to-r from-[var(--ps-primary)] to-[var(--ps-secondary)] bg-clip-text text-transparent">
                  Verify compatibility.
                </span>
              </h1>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--ps-muted)]">
                Ask about a phone or a part number. PartScout researches the live public web, extracts the actual
                claims from the pages it finds, and shows you the evidence confidence — including when the honest
                answer is “not enough evidence”.
              </p>

              <div className="mt-7">
                <HeroSearch />
              </div>

              <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--ps-muted)]">
                {[
                  "Sources cited for every claim",
                  "4G / 5G variants kept separate",
                  "Part number reverse lookup",
                  "Photo identification",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    <CircleCheck className="size-3.5 text-[var(--ps-success)]" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[var(--radius-card)] border border-[var(--ps-border)] bg-[var(--ps-surface)]/80 p-5 shadow-[var(--shadow-card)] backdrop-blur">
              <p className="text-sm font-semibold">What a PartScout answer contains</p>
              <ul className="mt-3 space-y-3 text-sm text-[var(--ps-muted)]">
                <li>
                  <span className="text-[var(--ps-text)]">Verdict + evidence confidence</span> — CONFIRMED, HIGH,
                  LIKELY, POSSIBLE, UNKNOWN or NOT COMPATIBLE, with the percentage broken down by source quality,
                  independence, agreement and specificity.
                </li>
                <li>
                  <span className="text-[var(--ps-text)]">Compatible models &amp; variants</span> — grouped exactly as
                  the sources state them, including the model numbers they cite.
                </li>
                <li>
                  <span className="text-[var(--ps-text)]">Why</span> — the checklist dimensions that were supported,
                  contradicted or left unknown, each linked to its claim.
                </li>
                <li>
                  <span className="text-[var(--ps-text)]">Warnings &amp; conflicts</span> — what to verify before
                  installing, and any sources that disagree.
                </li>
                <li>
                  <span className="text-[var(--ps-text)]">Source cards</span> — domain, tier, published date, the
                  exact quote used and a link to the page.
                </li>
              </ul>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild variant="secondary" size="sm">
                  <Link href="/about">Methodology</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/help">
                    Help
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SearchModes />
      <SupportedParts />
      <HowItWorks />
      <TrustSection />
    </>
  );
}
