"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, Radar, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/search/phone", label: "Find parts" },
  { href: "/search/part", label: "Find phones" },
  { href: "/identify", label: "Identify" },
  { href: "/history", label: "History" },
  { href: "/pricing", label: "Pricing" },
  { href: "/help", label: "Help" },
];

export function SiteHeader({ user }: { user: { name: string | null; email: string } | null }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  // Close the mobile drawer when the route changes. Adjusting state during a
  // render (instead of in an effect) avoids a second render pass with the
  // drawer still open above the new page.
  const [lastPathname, setLastPathname] = React.useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-colors duration-200",
        scrolled
          ? "border-[var(--ps-border)] ps-glass"
          : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="ps-focus-ring flex items-center gap-2 rounded-lg py-1 pr-2 font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-[var(--ps-primary)] text-white">
            <Radar className="size-4" aria-hidden />
          </span>
          <span className="text-[15px] tracking-tight">PartScout</span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "ps-focus-ring rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-[var(--ps-surface-2)] text-[var(--ps-text)]"
                    : "text-[var(--ps-muted)] hover:text-[var(--ps-text)]",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <Button asChild variant="secondary" size="sm" className="hidden sm:inline-flex">
              <Link href="/profile">{user.name?.split(" ")[0] ?? "Account"}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/search">Start research</Link>
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X aria-hidden /> : <Menu aria-hidden />}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden border-t border-[var(--ps-border)] ps-glass lg:hidden"
          >
            <nav className="mx-auto grid w-full max-w-7xl gap-1 px-4 py-3 sm:px-6" aria-label="Mobile">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="ps-focus-ring rounded-lg px-3 py-3 text-sm text-[var(--ps-muted)] hover:bg-[var(--ps-surface-2)] hover:text-[var(--ps-text)]"
                >
                  {link.label}
                </Link>
              ))}
              <div className="mt-2 flex gap-2">
                {user ? (
                  <Button asChild variant="secondary" className="flex-1">
                    <Link href="/profile">Account</Link>
                  </Button>
                ) : (
                  <>
                    <Button asChild variant="secondary" className="flex-1">
                      <Link href="/login">Sign in</Link>
                    </Button>
                    <Button asChild className="flex-1">
                      <Link href="/search">Start research</Link>
                    </Button>
                  </>
                )}
              </div>
            </nav>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
