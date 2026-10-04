"use client";

import * as React from "react";
import type { Capabilities } from "@/lib/config";
import type { SessionUser } from "@/lib/auth/session";

export interface SessionValue {
  user: SessionUser | null;
  capabilities: Capabilities;
}

const SessionContext = React.createContext<SessionValue | null>(null);

export function SessionProvider({ value, children }: { value: SessionValue; children: React.ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = React.useContext(SessionContext);
  if (!value) {
    // Should not happen inside the app shell; degrade instead of crashing a page.
    return {
      user: null,
      capabilities: {
        searchConfigured: false,
        searchProvider: null,
        searchProviderRaw: "",
        aiConfigured: false,
        aiProvider: "none",
        aiProviderRaw: "",
        visionConfigured: false,
        databaseConfigured: false,
        googleOAuthConfigured: false,
        fixturesEnabled: false,
        setupIssues: [],
      },
    };
  }
  return value;
}
