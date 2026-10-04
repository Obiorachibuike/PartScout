"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@/components/ui/primitives";
import { apiFetch } from "@/lib/client/api";
import { useSession } from "@/components/providers/session-provider";

interface AuthFormProps {
  mode: "login" | "register";
}

/** Email + password auth. Google sign-in appears only when it is configured. */
export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const params = useSearchParams();
  const { capabilities } = useSession();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const next = params.get("next");
  const oauthError = params.get("error");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (mode === "register") {
      if (password.length < 10 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
        setError("Use at least 10 characters with at least one letter and one number.");
        return;
      }
    }

    setPending(true);
    try {
      const result = await apiFetch<{ user: { email: string } }>(
        mode === "login" ? "/api/auth/login" : "/api/auth/register",
        {
          method: "POST",
          body: mode === "login" ? { email, password } : { email, password, name: name.trim() || undefined },
        },
      );
      if (!result.ok) {
        setError(result.error?.message ?? "Authentication failed");
        return;
      }
      toast.success(mode === "login" ? "Signed in" : "Account created");
      router.push(next && next.startsWith("/") ? next : "/history");
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>{mode === "login" ? "Sign in to PartScout" : "Create your PartScout account"}</CardTitle>
        <CardDescription>
          Accounts keep your research history and saved lookups. Compatibility research itself never depends on the
          model’s opinion — only on the evidence trail.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {oauthError ? (
          <p className="rounded-xl border border-[color-mix(in_oklab,var(--ps-danger)_40%,transparent)] bg-[color-mix(in_oklab,var(--ps-danger)_10%,transparent)] p-3 text-xs">
            Google sign-in failed ({oauthError.replace(/_/g, " ")}). Try email sign-in instead.
          </p>
        ) : null}

        {!capabilities.databaseConfigured ? (
          <p className="rounded-xl border border-[color-mix(in_oklab,var(--ps-warning)_40%,transparent)] bg-[color-mix(in_oklab,var(--ps-warning)_10%,transparent)] p-3 text-xs">
            This deployment has no database configured, so accounts cannot be created. Research, identification and
            reports all still work — set <code>DATABASE_URL</code> to enable history, saved research and feedback.
          </p>
        ) : null}

        <form onSubmit={submit} className="space-y-3">
          {mode === "register" ? (
            <div className="space-y-2">
              <Label htmlFor="name">Name (optional)</Label>
              <Input id="name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@workshop.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder={mode === "register" ? "At least 10 characters" : ""}
            />
          </div>

          {error ? <p className="text-sm text-[var(--ps-danger)]">{error}</p> : null}

          <Button type="submit" className="w-full" size="lg" loading={pending}>
            {mode === "login" ? "Sign in" : "Create account"}
          </Button>
        </form>

        {capabilities.googleOAuthConfigured ? (
          <Button asChild variant="secondary" className="w-full">
            <a href="/api/auth/google">Continue with Google</a>
          </Button>
        ) : null}

        <p className="text-center text-xs text-[var(--ps-muted)]">
          {mode === "login" ? (
            <>
              No account yet?{" "}
              <Link className="underline" href="/register">
                Create one
              </Link>
            </>
          ) : (
            <>
              Already registered?{" "}
              <Link className="underline" href="/login">
                Sign in
              </Link>
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
