"use client";

import { ListTree } from "lucide-react";
import type { ResearchReport } from "@/types/research";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Collapsible } from "@/components/ui/primitives";

/**
 * Research transparency: how PartScout read the question and which searches it
 * ran. Technicians use this to spot a misread model number immediately, and it
 * doubles as an audit trail of what was actually searched.
 */
export function ReportPlan({ report }: { report: ResearchReport }) {
  const plan = report.plan;

  const fields: Array<{ label: string; values: string[] }> = [
    { label: "Intent", values: [plan.intent.replace(/_/g, " ")] },
    { label: "Device", values: plan.device ? [plan.device] : [] },
    { label: "Brand", values: plan.deviceBrand ? [plan.deviceBrand] : [] },
    { label: "Model numbers", values: plan.modelNumbers },
    { label: "Variant markers", values: plan.variantMarkers },
    { label: "Part", values: plan.part ? [plan.part] : [] },
    { label: "Part category", values: [plan.partCategory.replace(/_/g, " ")] },
    { label: "Part number", values: plan.partNumber ? [plan.partNumber] : [] },
    { label: "Region", values: plan.region ? [plan.region] : [] },
  ].filter((field) => field.values.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListTree className="size-4 text-[var(--ps-primary)]" aria-hidden />
          How PartScout read this question
        </CardTitle>
        <CardDescription>
          Check this first: if the device or variant was read differently from your intent, re-run with the exact model
          number.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid gap-2 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.label} className="rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] p-2.5">
              <dt className="text-[10px] uppercase tracking-wide text-[var(--ps-muted)]">{field.label}</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {field.values.map((value) => (
                  <Badge key={value} tone="muted" className="text-[11px]">
                    {value}
                  </Badge>
                ))}
              </dd>
            </div>
          ))}
        </dl>

        <p className="text-[11px] text-[var(--ps-muted)]">
          Parsed with the {plan.understandingMethod === "deterministic" ? "deterministic parser" : "AI-assisted parser"}
          . Variants are never merged silently: Galaxy A15 4G, A15 5G and SM-A155F are treated as distinct identities.
        </p>

        <Collapsible
          summary={<span>Search queries ({plan.queries.length})</span>}
        >
          <ul className="space-y-2">
            {plan.queries.map((query) => (
              <li key={query.query} className="rounded-lg border border-[var(--ps-border)] bg-[var(--ps-surface)] p-2.5">
                <p className="break-words text-[13px] text-[var(--ps-text)]">{query.query}</p>
                <p className="mt-1 text-[11px]">
                  <Badge tone="muted" className="mr-1.5 text-[10px]">
                    {query.kind.replace(/_/g, " ")}
                  </Badge>
                  {query.purpose}
                </p>
              </li>
            ))}
          </ul>
        </Collapsible>

        {plan.understandingNotes.length > 0 ? (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ps-muted)]">Parser notes</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] text-[var(--ps-muted)]">
              {plan.understandingNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-[11px] text-[var(--ps-muted)]">
          {report.usage.searchCalls} search calls · {report.usage.pagesFetched} pages read ·{" "}
          {report.usage.aiCalls} model call{report.usage.aiCalls === 1 ? "" : "s"} ·{" "}
          {Math.round(report.usage.durationMs / 100) / 10}s
        </p>
      </CardContent>
    </Card>
  );
}
