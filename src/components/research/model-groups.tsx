"use client";

import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import type { CompatibleModelFinding } from "@/types/research";

function ModelRow({ finding, tone }: { finding: CompatibleModelFinding; tone: "success" | "danger" }) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] p-3">
      <span className="text-sm font-medium">{finding.device}</span>
      {finding.modelNumbers.map((model) => (
        <Badge key={model} tone="muted" className="font-mono text-[11px]">
          {model}
        </Badge>
      ))}
      {finding.variantMarkers.map((marker) => (
        <Badge key={marker} tone="primary" className="text-[11px] uppercase">
          {marker}
        </Badge>
      ))}
      <span className="ml-auto flex items-center gap-2 text-[11px] text-[var(--ps-muted)]">
        {finding.partNumberMatched ? (
          <Badge tone={tone === "success" ? "success" : "warning"} className="text-[10px]">
            part number cited
          </Badge>
        ) : null}
        {finding.independentSources} source{finding.independentSources === 1 ? "" : "s"} ·{" "}
        {Math.round(finding.averageSourceQuality * 100)}% quality
      </span>
    </li>
  );
}

export function ModelGroups({
  compatible,
  incompatible,
}: {
  compatible: CompatibleModelFinding[];
  incompatible: CompatibleModelFinding[];
}) {
  if (compatible.length === 0 && incompatible.length === 0) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {compatible.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Models the evidence says this fits</CardTitle>
            <CardDescription>
              Grouped by the device family written on the source, with the model numbers that source actually cites.
              Variant markers (4G/5G/internal SKUs) are kept exactly as the evidence states them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {compatible.map((finding) => (
                <ModelRow key={`${finding.device}-${finding.modelNumbers.join(",")}`} finding={finding} tone="success" />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {incompatible.length > 0 ? (
        <Card className="border-[color-mix(in_oklab,var(--ps-danger)_35%,transparent)]">
          <CardHeader>
            <CardTitle>Models with opposing evidence</CardTitle>
            <CardDescription>
              These findings came from sources that state or imply the part does <em>not</em> fit. They are shown as
              found — never averaged away.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {incompatible.map((finding) => (
                <ModelRow key={`${finding.device}-${finding.modelNumbers.join(",")}`} finding={finding} tone="danger" />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
