/**
 * Landing page: a persona chooser. The demo is a three-hander — pick who you
 * are and land on that persona's page. The same three links live in the top
 * bar of every page (app/nav.tsx).
 */

import Link from "next/link";
import { DEPLOYMENT } from "@/lib/deployment";

const PERSONA_CARDS = [
  {
    href: "/wallet",
    title: "Account holder",
    tagline: "the regular user",
    accent: "border-emerald-800 hover:border-emerald-600",
    cta: "Open the wallet →",
    ctaCls: "text-emerald-400",
    blurb:
      "You own tokens and want to move them without the whole world reading the amounts. " +
      "Connect Freighter, deposit, transfer, withdraw — every operation is a zero-knowledge " +
      "proof generated in your browser, and on-chain your balance is just a curve point.",
  },
  {
    href: "/verify",
    title: "Disclosure receiver",
    tagline: "the curious counterparty",
    accent: "border-indigo-800 hover:border-indigo-600",
    cta: "Verify a disclosure →",
    ctaCls: "text-indigo-400",
    blurb:
      "You're a tax office, compliance desk, or just someone who needs proof of one payment. " +
      "You hand an account holder a one-time request, they hand back a proof, and you learn " +
      "exactly one amount about exactly one transfer — and nothing else. No wallet needed.",
  },
  {
    href: "/auditor",
    title: "Auditor",
    tagline: "the one with the master key",
    accent: "border-amber-800 hover:border-amber-600",
    cta: "Open the auditor console →",
    ctaCls: "text-amber-400",
    blurb:
      "Every account in this deployment registered under your auditor key, so every transfer " +
      "and withdrawal carries ciphertexts only you can open. One secret key, the public event " +
      "stream, and the whole ledger decrypts — no cooperation from anyone required.",
  },
] as const;

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Confidential Token · Stellar</h1>
        <p className="mt-1 text-sm text-neutral-400">
          A confidential token on Stellar testnet: balances are Grumpkin Pedersen commitments,
          every move is an on-chain UltraHonk proof, and amounts stay private — except from
          exactly the people who are supposed to see them. Pick your role:
        </p>
      </header>

      <div className="space-y-4">
        {PERSONA_CARDS.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className={`block rounded border bg-black/30 p-5 transition-colors ${p.accent}`}
          >
            <div className="flex items-baseline gap-2">
              <h2 className="text-lg font-medium">{p.title}</h2>
              <span className="text-sm text-neutral-500">— {p.tagline}</span>
            </div>
            <p className="mt-2 text-sm text-neutral-400">{p.blurb}</p>
            <span className={`mt-3 inline-block text-sm font-medium ${p.ctaCls}`}>{p.cta}</span>
          </Link>
        ))}
      </div>

      <footer className="mt-10 text-xs text-neutral-600">
        token {short(DEPLOYMENT.contracts.token)} · verifier {short(DEPLOYMENT.contracts.verifier)} ·
        auditor {short(DEPLOYMENT.contracts.auditor)} · testnet · unaudited demo
      </footer>
    </main>
  );
}

function short(id: string): string {
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}
