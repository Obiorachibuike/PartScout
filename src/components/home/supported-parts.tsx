"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { PART_CATEGORY_LIST, HOMEPAGE_PART_GROUPS } from "@/lib/domain/parts";

/**
 * Supported parts.
 *
 * PartScout has per-category checklists: a screen is not "the same size" as
 * another screen, and a battery is not interchangeable because the voltage looks
 * similar. Each card links into a research flow pre-scoped to that category.
 */
export function SupportedParts() {
  const byLabel = new Map(PART_CATEGORY_LIST.map((definition) => [definition.label, definition]));

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6" aria-labelledby="parts-heading">
      <div className="mb-8 max-w-3xl">
        <h2 id="parts-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Supported parts — with a compatibility checklist per category
        </h2>
        <p className="mt-2 text-sm text-[var(--ps-muted)]">
          Every category is researched against its own checks (connector type, flex layout, revision, panel
          technology…). There is no “same size = compatible” shortcut anywhere in PartScout.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {HOMEPAGE_PART_GROUPS.map((group, index) => {
          const primary = byLabel.get(group.items[0] ?? "") ?? null;
          return (
            <motion.div
              key={group.title}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.3, delay: index * 0.04 }}
              className="rounded-[var(--radius-card)] border border-[var(--ps-border)] bg-[var(--ps-surface)] p-5"
            >
              <p className="text-sm font-semibold">{group.title}</p>
              <ul className="mt-3 space-y-1.5 text-sm text-[var(--ps-muted)]">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {primary ? (
                <Link
                  href={`/search/phone?part=${primary.id}`}
                  className="ps-focus-ring mt-4 inline-flex rounded-lg text-xs font-medium text-[var(--ps-primary)] hover:underline"
                >
                  Research {primary.label.toLowerCase()} compatibility →
                </Link>
              ) : null}
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
