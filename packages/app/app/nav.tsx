"use client";

/**
 * Persona switcher shown at the top of every page. The demo is a three-hander
 * — account holder, disclosure receiver, auditor — and each persona has its
 * own page; this bar makes the cast explicit and keeps switching one click.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

export const PERSONAS = [
  {
    href: "/wallet",
    label: "Account holder",
    accent: "text-emerald-300 border-emerald-700 bg-emerald-950/40",
  },
  {
    href: "/verify",
    label: "Disclosure receiver",
    accent: "text-indigo-300 border-indigo-700 bg-indigo-950/40",
  },
  {
    href: "/auditor",
    label: "Auditor",
    accent: "text-amber-300 border-amber-700 bg-amber-950/40",
  },
] as const;

export function PersonaNav() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-neutral-900 bg-black/40">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-5 py-3">
        <Link href="/" className="mr-2 text-sm font-semibold text-neutral-200 hover:text-white">
          Confidential Token <span className="text-neutral-500">· Stellar</span>
        </Link>
        <span className="mr-1 hidden text-xs text-neutral-600 sm:inline">you are:</span>
        {PERSONAS.map((p) => {
          const active = pathname.startsWith(p.href);
          return (
            <Link
              key={p.href}
              href={p.href}
              className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? p.accent
                  : "border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
              }`}
            >
              {p.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
