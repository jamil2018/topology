"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Button } from "@heroui/react";
import { signOut } from "next-auth/react";

const nav = [
  { href: "/", label: "Hub" },
  { href: "/cases", label: "Cases" },
  { href: "/runs", label: "Runs" },
  { href: "/automation", label: "Automation" },
  { href: "/triage", label: "Triage" },
  { href: "/connect", label: "Agents" },
];

export function HubShell({
  children,
  userEmail,
}: {
  children: React.ReactNode;
  userEmail?: string | null;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen topology-shell">
      <header className="sticky top-0 z-40 border-b border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-8">
            <Link href="/" className="group flex items-baseline gap-2">
              <span className="font-[family-name:var(--font-display)] text-2xl tracking-tight text-[color:var(--topo-ink)]">
                Topology
              </span>
              <span className="hidden text-xs uppercase tracking-[0.18em] text-[color:var(--topo-muted)] sm:inline">
                TCM
              </span>
            </Link>
            <nav className="flex items-center gap-1">
              {nav.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative rounded-md px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? "text-[color:var(--topo-ink)]"
                        : "text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
                    }`}
                  >
                    {active ? (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-md bg-[color:var(--topo-accent-soft)]"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    ) : null}
                    <span className="relative z-10">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {userEmail ? (
              <span className="hidden text-xs text-[color:var(--topo-muted)] md:inline">
                {userEmail}
              </span>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              onPress={() => signOut({ callbackUrl: "/login" })}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
