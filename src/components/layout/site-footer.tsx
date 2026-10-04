import Link from "next/link";
import { PART_CATEGORY_LIST } from "@/lib/domain/parts";
import { appConfig } from "@/lib/config";

export function SiteFooter() {
  const year = new Date().getFullYear();
  const categories = PART_CATEGORY_LIST.slice(0, 8);

  return (
    <footer className="mt-20 border-t border-[var(--ps-border)] bg-[var(--ps-surface)]">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-4">
        <div className="space-y-3">
          <p className="text-sm font-semibold">PartScout</p>
          <p className="text-sm text-[var(--ps-muted)]">
            Live-web compatibility research for phone repair parts. Every answer cites the sources it came from.
          </p>
          <p className="text-xs text-[var(--ps-muted)]">
            Not a laboratory test. Always verify the part before installing.
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--ps-muted)]">Research</p>
          <ul className="space-y-2 text-sm">
            <li><Link className="text-[var(--ps-muted)] hover:text-[var(--ps-text)]" href="/search/phone">Find compatible parts</Link></li>
            <li><Link className="text-[var(--ps-muted)] hover:text-[var(--ps-text)]" href="/search/part">Find compatible phones</Link></li>
            <li><Link className="text-[var(--ps-muted)] hover:text-[var(--ps-text)]" href="/search/compatibility">Check compatibility</Link></li>
            <li><Link className="text-[var(--ps-muted)] hover:text-[var(--ps-text)]" href="/identify">Identify a part</Link></li>
          </ul>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--ps-muted)]">Supported parts</p>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {categories.map((definition) => (
              <li key={definition.id}>
                <Link
                  className="text-[var(--ps-muted)] hover:text-[var(--ps-text)]"
                  href={`/search/phone?part=${definition.id}`}
                >
                  {definition.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--ps-muted)]">Product</p>
          <ul className="space-y-2 text-sm">
            <li><Link className="text-[var(--ps-muted)] hover:text-[var(--ps-text)]" href="/pricing">Pricing</Link></li>
            <li><Link className="text-[var(--ps-muted)] hover:text-[var(--ps-text)]" href="/about">About &amp; methodology</Link></li>
            <li><Link className="text-[var(--ps-muted)] hover:text-[var(--ps-text)]" href="/help">Help</Link></li>
            <li><Link className="text-[var(--ps-muted)] hover:text-[var(--ps-text)]" href="/saved">Saved research</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-[var(--ps-border)]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-[var(--ps-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {year} {appConfig.appName}. Research assistance only — not a guarantee of fitment.</p>
          <p>
            Searches use licensed search APIs. Google/Bing markup is never scraped. AI is the reasoning
            layer only — it is never treated as a source of truth.
          </p>
        </div>
      </div>
    </footer>
  );
}
