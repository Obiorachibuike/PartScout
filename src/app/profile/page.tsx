import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { getSession, isAdmin } from "@/lib/auth/session";
import { listResearchForUser } from "@/lib/db/research-repository";
import { isDatabaseConfigured } from "@/lib/db/client";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { planDefinition } from "@/lib/plans";
import { ProfileForm } from "@/components/auth/profile-form";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Profile",
  description: "Your PartScout account, plan and usage.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/profile");

  const history = isDatabaseConfigured() ? await listResearchForUser(session.id, { take: 5 }) : [];
  const plan = planDefinition(session.plan);

  return (
    <PageShell
      wide
      eyebrow={session.email}
      title="Profile"
      description="Account, plan and recent activity."
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>Your display name appears on saved research.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileForm name={session.name ?? ""} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent research</CardTitle>
              <CardDescription>The five most recent runs on this account.</CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-[var(--ps-muted)]">
                  Nothing yet.{" "}
                  <Link className="underline" href="/search">
                    Start a research run
                  </Link>
                  .
                </p>
              ) : (
                <ul className="space-y-2">
                  {history.map((item) => (
                    <li key={item.id} className="rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] p-3">
                      <Link href={`/results/${item.id}`} className="text-sm hover:underline">
                        {item.question}
                      </Link>
                      <p className="mt-1 text-[11px] text-[var(--ps-muted)]">
                        {item.verdict.replace(/_/g, " ")} · {item.confidenceScore}% · {formatDate(item.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex gap-2">
                <Button asChild variant="secondary" size="sm">
                  <Link href="/history">Full history</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/saved">Saved research</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Plan
                <Badge tone={plan.id === "FREE" ? "muted" : "primary"}>{plan.name}</Badge>
              </CardTitle>
              <CardDescription>{plan.tagline}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-[var(--ps-muted)]">
                Up to <span className="text-[var(--ps-text)]">{plan.dailyResearches} research runs/day</span> and{" "}
                <span className="text-[var(--ps-text)]">{plan.maxQueriesPerResearch} search queries</span> per run.
              </p>
              <ul className="list-inside list-disc space-y-1 text-xs text-[var(--ps-muted)]">
                {plan.features.slice(0, 4).map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <Button asChild variant="secondary" size="sm">
                <Link href="/pricing">{plan.id === "FREE" ? "Compare plans" : "Manage plan"}</Link>
              </Button>
              <p className="text-[11px] text-[var(--ps-muted)]">
                Plans are structural today: PartScout ships without a payment provider so deployments can bring their
                own billing.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Session &amp; security</CardTitle>
              <CardDescription>
                Signed in with {session.email}. Sessions are signed HTTP-only cookies; state-changing requests require
                a CSRF token.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-1.5 text-xs text-[var(--ps-muted)]">
                <li>Role: {session.role.toLowerCase()}</li>
                <li>Database: {isDatabaseConfigured() ? "configured" : "not configured (degraded mode)"}</li>
                <li>Admin access: {isAdmin(session) ? "yes" : "no"}</li>
              </ul>
              <div className="flex flex-wrap gap-2">
                {isAdmin(session) ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/admin">Admin dashboard</Link>
                  </Button>
                ) : null}
                <ProfileForm.SignOut />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
