"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Camera, Layers, ScanSearch, Smartphone } from "lucide-react";
import { Card } from "@/components/ui/primitives";

const MODES = [
  {
    href: "/search/phone",
    title: "Find compatible parts",
    description:
      "Start from a phone or model number and research which screens, batteries, flexes and cameras are documented as compatible.",
    icon: Smartphone,
    accent: "#6366F1",
    example: "Galaxy A15 4G screen",
  },
  {
    href: "/search/part",
    title: "Find compatible phones",
    description:
      "Reverse lookup. Give a part name or an OEM part number and PartScout researches which devices cite it.",
    icon: Layers,
    accent: "#8B5CF6",
    example: "BN5A battery",
  },
  {
    href: "/search/compatibility",
    title: "Check compatibility",
    description:
      "Have a specific part and phone? PartScout gathers the evidence for that exact pairing and shows both sides.",
    icon: ScanSearch,
    accent: "#22C55E",
    example: "A15 5G screen in an A15 4G",
  },
  {
    href: "/identify",
    title: "Identify a part",
    description:
      "Photograph the part. Vision reads the printed part or model number, you confirm it, and research starts from there.",
    icon: Camera,
    accent: "#F59E0B",
    example: "Photo of a flex label",
  },
];

export function SearchModes() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6" aria-labelledby="modes-heading">
      <div className="mb-8 max-w-2xl">
        <h2 id="modes-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Four ways to research a part
        </h2>
        <p className="mt-2 text-sm text-[var(--ps-muted)]">
          Phone → part, part → phone, a specific pairing, or a photograph. All four run the same live-web research
          pipeline and cite the same evidence trail.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MODES.map((mode, index) => (
          <motion.div
            key={mode.href}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.35, delay: index * 0.05, ease: "easeOut" }}
          >
            <Card className="group h-full p-5 transition-colors hover:border-[var(--ps-border-strong)]">
              <Link href={mode.href} className="ps-focus-ring flex h-full flex-col gap-3 rounded-lg">
                <span
                  className="grid size-10 place-items-center rounded-xl"
                  style={{
                    background: `color-mix(in oklab, ${mode.accent} 16%, transparent)`,
                    color: mode.accent,
                  }}
                >
                  <mode.icon className="size-5" aria-hidden />
                </span>
                <span className="text-[15px] font-semibold">{mode.title}</span>
                <span className="text-sm text-[var(--ps-muted)]">{mode.description}</span>
                <span className="mt-auto pt-2 text-xs text-[var(--ps-muted)]">
                  e.g. <span className="text-[var(--ps-text)]">{mode.example}</span>
                </span>
              </Link>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
