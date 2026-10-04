"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, CircleCheck, Loader2, ScanLine, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@/components/ui/primitives";
import { useSession } from "@/components/providers/session-provider";
import { ApiError, apiFetch } from "@/lib/client/api";
import type { IdentificationResult, ResearchReport } from "@/types/research";

interface IdentifyResponse {
  identification: IdentificationResult;
  identificationId: string | null;
  imageHash: string;
  researchQuestion: string | null;
  report: ResearchReport | null;
  usage: { aiCalls: number; estimatedCostUsd: number };
}

const MAX_BYTES = 6_000_000;

export function IdentifyFlow() {
  const { capabilities } = useSession();
  const [file, setFile] = React.useState<File | null>(null);
  const [hint, setHint] = React.useState("");
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<IdentifyResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [override, setOverride] = React.useState("");
  const [manual, setManual] = React.useState("");

  // Object URLs are derived from the selected file, so they are created during
  // render (client-only component) and revoked when the file changes.
  const previewUrl = React.useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  React.useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const router = useRouter();

  const pick = (selected: File | null) => {
    setResult(null);
    setError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!selected.type.startsWith("image/")) {
      setError("Please choose an image file (JPEG, PNG, WebP or HEIC).");
      return;
    }
    if (selected.size > MAX_BYTES) {
      setError(`That photo is ${(selected.size / 1_000_000).toFixed(1)} MB. The limit is ${MAX_BYTES / 1_000_000} MB.`);
      return;
    }
    setFile(selected);
  };

  const submit = async (options: { runResearch: boolean; identifierOverride?: string | null }) => {
    if (!file && !options.identifierOverride) {
      setError("Choose a photo of the part first, or type the identifier manually.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      if (file && !options.identifierOverride) {
        const form = new FormData();
        form.set("image", file);
        if (hint.trim()) form.set("hint", hint.trim());
        form.set("runResearch", options.runResearch ? "true" : "false");
        const response = await apiFetch<IdentifyResponse>("/api/identify", { method: "POST", formData: form });
        if (!response.ok || !response.data) {
          setError(response.error?.message ?? "Identification failed");
          return;
        }
        setResult(response.data);
        setOverride(response.data.identification.identifier);
        toast.success(
          response.data.identification.identifier
            ? `Read: ${response.data.identification.identifier}`
            : "Photo processed",
        );
        return;
      }

      // Manual identifier research: skip vision entirely and run the pipeline.
      if (!options.identifierOverride) return;
      const research = await apiFetch<{ question: string; report: ResearchReport | null }>("/api/identify/manual", {
        method: "POST",
        body: { identifier: options.identifierOverride, hint: hint.trim() || null },
      });
      if (!research.ok || !research.data?.report) {
        setError(research.error?.message ?? "Research failed");
        return;
      }
      router.push(`/results/${encodeURIComponent(research.data.report.id)}`);
      return;
    } catch (thrown) {
      setError(thrown instanceof ApiError ? thrown.publicError.message : "Something went wrong");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-start">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanLine className="size-4 text-[var(--ps-primary)]" aria-hidden />
            Photograph the part
          </CardTitle>
          <CardDescription>
            Get the printed label sharp and centred: battery labels, flex part numbers and screen service-pack stickers
            are the most reliable identifiers. Photos are read by the vision model only — they are not stored on disk.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-dashed border-[var(--ps-border-strong)] bg-[var(--ps-surface-2)] p-4">
            {previewUrl ? (
              <div className="relative overflow-hidden rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Selected part photo" className="max-h-72 w-full object-contain" />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Camera className="size-8 text-[var(--ps-muted)]" aria-hidden />
                <p className="text-sm text-[var(--ps-muted)]">Take a photo or pick one from your device</p>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="secondary" size="sm">
                <label className="cursor-pointer">
                  <Upload aria-hidden />
                  Choose photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => pick(event.target.files?.[0] ?? null)}
                  />
                </label>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <label className="cursor-pointer">
                  <Camera aria-hidden />
                  Use camera
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(event) => pick(event.target.files?.[0] ?? null)}
                  />
                </label>
              </Button>
              {file ? (
                <Button variant="ghost" size="sm" onClick={() => pick(null)}>
                  Clear
                </Button>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hint">Context for the model (optional)</Label>
            <Input
              id="hint"
              value={hint}
              onChange={(event) => setHint(event.target.value)}
              placeholder="e.g. battery from a Samsung A15, text is tiny"
            />
          </div>

          {!capabilities.visionConfigured ? (
            <div className="flex items-start gap-2 rounded-xl border border-[color-mix(in_oklab,var(--ps-warning)_40%,transparent)] bg-[color-mix(in_oklab,var(--ps-warning)_10%,transparent)] p-3 text-xs">
              <TriangleAlert className="mt-0.5 size-3.5 text-[var(--ps-warning)]" aria-hidden />
              <p>
                Photo identification needs a vision-capable AI provider. This deployment has none configured, so
                PartScout will not pretend to read the photo — type the identifier below instead and it will research
                that.
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              loading={running}
              disabled={!file || !capabilities.visionConfigured}
              onClick={() => void submit({ runResearch: true })}
            >
              Identify &amp; research
            </Button>
            <Button
              variant="secondary"
              size="lg"
              loading={running && Boolean(file)}
              disabled={!file || !capabilities.visionConfigured}
              onClick={() => void submit({ runResearch: false })}
            >
              Identify only
            </Button>
          </div>

          <div className="rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] p-3">
            <Label htmlFor="manual">Know the number already?</Label>
            <div className="mt-2 flex gap-2">
              <Input
                id="manual"
                value={manual}
                onChange={(event) => setManual(event.target.value)}
                placeholder="BN5A, GH82-31234A, SM-A155F…"
              />
              <Button
                variant="secondary"
                loading={running}
                disabled={manual.trim().length < 2}
                onClick={() => void submit({ runResearch: true, identifierOverride: manual.trim() })}
              >
                Research
              </Button>
            </div>
          </div>

          {error ? <p className="text-sm text-[var(--ps-danger)]">{error}</p> : null}
        </CardContent>
      </Card>

      <div className="space-y-6">
        {running && !result ? (
          <Card className="p-6">
            <div className="flex items-center gap-3 text-sm text-[var(--ps-muted)]">
              <Loader2 className="size-4 animate-spin text-[var(--ps-primary)]" aria-hidden />
              Reading the photo and researching the identifier…
            </div>
          </Card>
        ) : null}

        {result ? (
          <Card>
            <CardHeader>
              <CardTitle>What PartScout read</CardTitle>
              <CardDescription>
                Vision only reads what is visible. Confirm or correct the identifier — research runs on the confirmed
                value, and the model never decides compatibility.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={result.identification.identifierType === "unknown" ? "muted" : "primary"}>
                  {result.identification.identifierType.replace(/_/g, " ")}
                </Badge>
                <Badge tone="muted">{result.identification.partCategory.replace(/_/g, " ")}</Badge>
                <span className="text-xs text-[var(--ps-muted)]">
                  read confidence {Math.round(result.identification.confidence * 100)}%
                </span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="override">Identifier to research</Label>
                <Input
                  id="override"
                  value={override}
                  onChange={(event) => setOverride(event.target.value)}
                  placeholder="part number or model number"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={override.trim().length < 2 || running}
                  loading={running}
                  onClick={() => void submit({ runResearch: true, identifierOverride: override.trim() })}
                >
                  Research this identifier
                </Button>
              </div>

              {result.identification.candidateDevice || result.identification.manufacturer ? (
                <p className="text-xs text-[var(--ps-muted)]">
                  Looks like{" "}
                  <span className="text-[var(--ps-text)]">
                    {[result.identification.manufacturer, result.identification.candidateDevice].filter(Boolean).join(" ")}
                  </span>
                </p>
              ) : null}

              {result.identification.printedText.length > 0 ? (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ps-muted)]">
                    Printed text read from the photo
                  </p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {result.identification.printedText.map((text) => (
                      <li key={text}>
                        <Badge tone="muted" className="font-mono text-[10px]">
                          {text}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {result.identification.parts.length > 0 ? (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ps-muted)]">
                    Component details
                  </p>
                  <ul className="mt-1.5 space-y-1.5 text-xs">
                    {result.identification.parts.map((part) => (
                      <li key={`${part.name}-${part.value}`} className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{part.name}</span>
                        {part.label ? <span className="text-[var(--ps-muted)]">{part.label}</span> : null}
                        <span className="text-[var(--ps-muted)]">{part.value}</span>
                        {part.partNumber ? (
                          <Badge tone="muted" className="font-mono text-[10px]">
                            {part.partNumber}
                          </Badge>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {result.identification.notes.length > 0 ? (
                <ul className="space-y-1 text-xs text-[var(--ps-muted)]">
                  {result.identification.notes.map((note) => (
                    <li key={note} className="flex gap-2">
                      <CircleCheck className="mt-0.5 size-3 shrink-0" aria-hidden />
                      {note}
                    </li>
                  ))}
                </ul>
              ) : null}

              {result.report ? (
                <div className="rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] p-3">
                  <p className="text-xs text-[var(--ps-muted)]">Research finished for this identifier</p>
                  <p className="mt-1 text-sm font-medium">{result.report.headline}</p>
                  <Button asChild size="sm" variant="secondary" className="mt-2">
                    <Link href={`/results/${encodeURIComponent(result.report.id)}`}>Open the report</Link>
                  </Button>
                </div>
              ) : result.researchQuestion ? (
                <p className="text-xs text-[var(--ps-muted)]">
                  Suggested research question: <span className="text-[var(--ps-text)]">{result.researchQuestion}</span>
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Card className="p-4">
          <p className="text-sm font-medium">Why identify first?</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--ps-muted)]">
            A model number printed on a part is far stronger evidence than a visual match. PartScout converts what it
            reads into a search identifier you approve, then researches that identifier on the live web — so the answer
            is built from published sources, not from the photo.
          </p>
        </Card>
      </div>
    </div>
  );
}
