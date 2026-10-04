"use client";

import { motion } from "framer-motion";
import { FileSearch, Globe2, ShieldCheck, Waypoints } from "lucide-react";

const STEPS = [
  {
    title: "Understand the question",
    description:
      "PartScout parses the device family, model numbers, variant markers (4G/5G/regional SKUs), the part concept and any part number — without silently merging variants.",
    icon: Waypoints,
  },
  {
    title: "Search the live web, many ways",
    description:
      "Several targeted queries run through a licensed search API (never scraped SERPs): device → part, part number → devices, spec and forum angles.",
    icon: Globe2,
  },
  {
    title: "Extract evidence, not opinions",
    description:
      "Pages are fetched, scored by source tier and turned into short structured claims: device, model numbers, part, quote, strength. Conflicting claims are kept as conflicts.",
    icon: FileSearch,
  },
  {
    title: "Score confidence and show the trail",
    description:
      "A deterministic engine groups the claims, runs the category checklist and computes evidence confidence. If the evidence is not there, PartScout says so.",
    icon: ShieldCheck,
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6" aria-labelledby="how-heading">
      <div className="mb-8 max-w-2xl">
        <h2 id="how-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          How PartScout works
        </h2>
        <p className="mt-2 text-sm text-[var(--ps-muted)]">
          Research runs while you watch: each stage streams to the results page, and every conclusion links back to
          the sources that produced it.
        </p>
      </div>

      <ol className="grid gap-4 lg:grid-cols-4">
        {STEPS.map((step, index) => (
          <motion.li
            key={step.title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.35, delay: index * 0.06 }}
            className="relative rounded-[var(--radius-card)] border border-[var(--ps-border)] bg-[var(--ps-surface)] p-5"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--ps-primary)_14%,transparent)] text-[var(--ps-primary)]">
                <step.icon className="size-4" aria-hidden />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ps-muted)]">
                Step {index + 1}
              </span>
            </div>
            <p className="mt-3 text-[15px] font-semibold">{step.title}</p>
            <p className="mt-1.5 text-sm text-[var(--ps-muted)]">{step.description}</p>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
