"use client";

import { motion } from "framer-motion";
import { Ban, CircleSlash, FileWarning, Link2, Scale, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/primitives";

const PRINCIPLES = [
  {
    title: "AI is never the source of truth",
    description:
      "The model may read a photo, lift short quotes and phrase an answer. It is never asked “does this fit?” and its output is rejected unless it is verifiable in the evidence.",
    icon: Scale,
  },
  {
    title: "No evidence, no answer",
    description:
      "If the web does not support a conclusion, PartScout answers “could not find enough reliable evidence” — it does not fall back to a guess.",
    icon: CircleSlash,
  },
  {
    title: "Conflicts are shown, not smoothed over",
    description:
      "When sources disagree, you see both sides with their domains, quotes and links instead of a forced verdict.",
    icon: FileWarning,
  },
  {
    title: "Variant accuracy",
    description:
      "Galaxy A15 4G, A15 5G and SM-A155F are tracked separately. Sibling-variant findings are labelled as such rather than presented as a match.",
    icon: ShieldAlert,
  },
  {
    title: "Every URL is real",
    description:
      "Sources come from the search provider and the fetch step — nothing is synthesised. Unreachable or non-text pages are marked as metadata-only.",
    icon: Link2,
  },
  {
    title: "Legitimate search APIs only",
    description:
      "Google, Bing and Yahoo result pages are never scraped. PartScout talks to licensed search APIs through a swappable provider interface.",
    icon: Ban,
  },
];

export function TrustSection() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6" aria-labelledby="trust-heading">
      <div className="mb-8 max-w-2xl">
        <h2 id="trust-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Built so you can trust the negative answers too
        </h2>
        <p className="mt-2 text-sm text-[var(--ps-muted)]">
          A compatibility tool is only useful if “unknown” really means unknown. These are enforced in code, not in
          marketing copy.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PRINCIPLES.map((principle, index) => (
          <motion.div
            key={principle.title}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.3, delay: index * 0.04 }}
          >
            <Card className="h-full p-5">
              <span className="grid size-9 place-items-center rounded-xl bg-[var(--ps-surface-2)] text-[var(--ps-primary)]">
                <principle.icon className="size-4" aria-hidden />
              </span>
              <p className="mt-3 text-[15px] font-semibold">{principle.title}</p>
              <p className="mt-1.5 text-sm text-[var(--ps-muted)]">{principle.description}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      <p className="mt-6 rounded-2xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] p-4 text-xs text-[var(--ps-muted)]">
        PartScout reports <strong className="text-[var(--ps-text)]">evidence confidence</strong>, not a laboratory
        guarantee. Compatibility can change with hardware revisions and region-specific SKUs — always verify the part
        against the device before installing, and test before sealing a repair.
      </p>
    </section>
  );
}
