"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Camera, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Textarea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "Samsung Galaxy A15 4G charging flex — which models does it fit?",
  "Does a Galaxy A15 5G screen fit the A15 4G?",
  "Which phones use battery BN5A?",
  "iPhone 13 back camera compatibility",
];

const MODES = [
  { id: "auto", label: "Ask anything" },
  { id: "phone", label: "Phone → parts" },
  { id: "part", label: "Part → phones" },
  { id: "compatibility", label: "Check a match" },
] as const;

export function HeroSearch({ initialMode = "auto" }: { initialMode?: string }) {
  const router = useRouter();
  const [value, setValue] = React.useState("");
  const [mode, setMode] = React.useState<string>(initialMode);
  const [pending, setPending] = React.useState(false);

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    const question = value.trim();
    if (question.length < 3) return;
    setPending(true);
    router.push(`/search?q=${encodeURIComponent(question)}&mode=${mode}&autorun=1`);
  };

  return (
    <div className="w-full">
      <form onSubmit={submit} className="relative">
        <div className="rounded-[1.35rem] border border-[var(--ps-border)] bg-[var(--ps-surface)]/90 p-2 shadow-[var(--shadow-float)] backdrop-blur">
          <Textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="Describe the part and the phone — “Samsung A15 4G charging flex, does it fit the 5G?”"
            rows={2}
            aria-label="Research question"
            className="border-transparent bg-transparent pr-2 text-[15px] focus-visible:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2 px-1 pb-1 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {MODES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setMode(option.id)}
                  className={cn(
                    "ps-focus-ring rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    mode === option.id
                      ? "border-transparent bg-[var(--ps-primary)] text-white"
                      : "border-[var(--ps-border)] text-[var(--ps-muted)] hover:text-[var(--ps-text)]",
                  )}
                  aria-pressed={mode === option.id}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <a href="/identify" aria-label="Identify a part from a photo">
                  <Camera aria-hidden />
                  Photo
                </a>
              </Button>
              <Button type="submit" size="lg" loading={pending} disabled={value.trim().length < 3}>
                <Search aria-hidden />
                Research
              </Button>
            </div>
          </div>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone="muted" className="gap-1">
          <Sparkles className="size-3" aria-hidden />
          Try
        </Badge>
        {EXAMPLES.map((example) => (
          <motion.button
            key={example}
            type="button"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => {
              setValue(example);
            }}
            className="ps-focus-ring rounded-full border border-[var(--ps-border)] bg-[var(--ps-surface-2)]/70 px-3 py-1.5 text-left text-xs text-[var(--ps-muted)] transition-colors hover:border-[var(--ps-border-strong)] hover:text-[var(--ps-text)]"
          >
            {example}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
