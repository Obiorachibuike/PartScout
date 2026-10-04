/**
 * Plan architecture.
 *
 * PartScout ships the *structure* for paid plans without a billing integration:
 * limits are enforced in the research layer, plans are stored on the user, and the
 * pricing page renders from this single source of truth. Wiring a payment
 * provider later means updating the user's plan — nothing else.
 */

/** Mirrors the `Plan` enum in prisma/schema.prisma. */
export type Plan = "FREE" | "PRO" | "TECHNICIAN";

export interface PlanDefinition {
  id: Plan;
  name: string;
  priceMonthlyUsd: number;
  tagline: string;
  dailyResearches: number;
  maxQueriesPerResearch: number;
  features: string[];
  highlighted?: boolean;
}

export const PLAN_DEFINITIONS: PlanDefinition[] = [
  {
    id: "FREE",
    name: "Free",
    priceMonthlyUsd: 0,
    tagline: "Check a part before you order it.",
    dailyResearches: 10,
    maxQueriesPerResearch: 5,
    features: [
      "Live-web compatibility research",
      "All four research modes",
      "Photo identification (when vision is configured)",
      "Sources, confidence and conflict reporting",
      "Research history",
    ],
  },
  {
    id: "PRO",
    name: "Pro",
    priceMonthlyUsd: 19,
    tagline: "For a busy repair bench.",
    dailyResearches: 150,
    maxQueriesPerResearch: 8,
    highlighted: true,
    features: [
      "Everything in Free",
      "Higher daily research limits",
      "Deeper query plans per research",
      "Saved research libraries",
      "Priority support",
    ],
  },
  {
    id: "TECHNICIAN",
    name: "Technician",
    priceMonthlyUsd: 49,
    tagline: "For shops and multi-seat workshops.",
    dailyResearches: 600,
    maxQueriesPerResearch: 10,
    features: [
      "Everything in Pro",
      "Workshop-level limits",
      "Shareable research reports",
      "Early access to new part categories",
      "Deployment guidance for your own keys",
    ],
  },
];

export function planDefinition(plan: string): PlanDefinition {
  return PLAN_DEFINITIONS.find((entry) => entry.id === plan) ?? PLAN_DEFINITIONS[0]!;
}
