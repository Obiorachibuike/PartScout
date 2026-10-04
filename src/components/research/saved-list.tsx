"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent } from "@/components/ui/primitives";
import { apiFetch } from "@/lib/client/api";
import { formatRelative } from "@/lib/utils";

export interface SavedItem {
  id: string;
  label: string;
  query: string;
  mode: string;
  createdAt: string;
}

export function SavedList({ items }: { items: SavedItem[] }) {
  const router = useRouter();
  const [removing, setRemoving] = React.useState<string | null>(null);

  const run = (item: SavedItem) => {
    const mode = item.mode === "part" ? "part" : item.mode === "compatibility" ? "compatibility" : "auto";
    if (mode === "auto") {
      router.push(`/search?q=${encodeURIComponent(item.query)}&autorun=1`);
      return;
    }
    router.push(`/search/${mode}?q=${encodeURIComponent(item.query)}`);
  };

  const remove = async (item: SavedItem) => {
    setRemoving(item.id);
    try {
      const result = await apiFetch(`/api/saved?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      if (!result.ok) {
        toast.error(result.error?.message ?? "Could not remove this saved search");
        return;
      }
      toast.success("Removed");
      router.refresh();
    } finally {
      setRemoving(null);
    }
  };

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id}>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.label}</p>
                <p className="mt-1 truncate text-xs text-[var(--ps-muted)]">{item.query}</p>
                <p className="mt-1 flex items-center gap-2 text-[11px] text-[var(--ps-muted)]">
                  <Badge tone="muted" className="text-[10px]">
                    {item.mode}
                  </Badge>
                  saved {formatRelative(item.createdAt)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => run(item)}>
                  <Play aria-hidden />
                  Research again
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${item.label}`}
                  loading={removing === item.id}
                  onClick={() => void remove(item)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
