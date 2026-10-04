"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "partscout-theme";
/** Fired after a toggle so every mounted toggle re-reads the document. */
const THEME_EVENT = "partscout:theme-change";

type Theme = "dark" | "light";

function readTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function subscribeToTheme(onChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function ThemeToggle() {
  // The theme lives on <html> (set by the inline script before paint), so it is
  // read as an external store rather than mirrored into React state.
  const theme = React.useSyncExternalStore(subscribeToTheme, readTheme, () => "dark" as Theme);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage disabled — the theme still applies for this session
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Light theme" : "Dark theme"}
    >
      {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  );
}
