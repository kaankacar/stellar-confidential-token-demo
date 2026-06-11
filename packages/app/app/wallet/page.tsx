"use client";

import { useCallback, useState } from "react";
import { ConfidentialWallet, type WalletView } from "@/lib/wallet";
import { DEPLOYMENT } from "@/lib/deployment";
import { EventsPanel } from "./events-panel";

export default function Page() {
  const [wallet, setWallet] = useState<ConfidentialWallet | null>(null);
  const [view, setView] = useState<WalletView | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [depositAmt, setDepositAmt] = useState("1000");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmt, setTransferAmt] = useState("400");
  const [withdrawAmt, setWithdrawAmt] = useState("400");

  const log = useCallback((msg: string) => {
    setLogs((prev) => [`${new Date().toLocaleTimeString()}  ${msg}`, ...prev].slice(0, 60));
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setBusy("connecting");
    try {
      const w = await ConfidentialWallet.connect(log);
      setWallet(w);
      setView(await w.refresh());
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }, [log]);

  const run = useCallback(
    (label: string, fn: (w: ConfidentialWallet) => Promise<void>) => async () => {
      if (!wallet) return;
      setError(null);
      setBusy(label);
      try {
        await fn(wallet);
        setView(await wallet.refresh());
      } catch (e) {
        setError(errMsg(e));
        log(`error: ${errMsg(e)}`);
      } finally {
        setBusy(null);
      }
    },
    [wallet, log],
  );

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">
          Account holder <span className="text-base font-normal text-neutral-500">· your wallet</span>
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          This page is for you, the regular user: you hold tokens, move them around, and nobody
          watching the chain learns the amounts. Balances are Grumpkin Pedersen commitments; every
          move is an on-chain UltraHonk proof, generated right here in your browser. If a
          counterparty asks you to prove what one transfer paid, disclose it from the activity
          list below. Testnet · unaudited demo.
        </p>
      </header>

      {!wallet ? (
        <button
          onClick={connect}
          disabled={busy !== null}
          className="rounded bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy === "connecting" ? "Connecting…" : "Connect Freighter"}
        </button>
      ) : (
        <div className="space-y-6">
          <Balances view={view} />

          <section className="grid gap-3 sm:grid-cols-2">
            <Action
              title="Register"
              hint="Bind your confidential keys to the contract (one-time)."
              disabled={busy !== null || view?.registered === true}
              busyLabel={busy === "register" ? "Working…" : null}
              onClick={run("register", (w) => w.register())}
              cta={view?.registered ? "Registered ✓" : "Register"}
            />
            <Action
              title="Merge"
              hint="Fold receiving balance into spendable."
              disabled={busy !== null || !view?.registered}
              busyLabel={busy === "merge" ? "Working…" : null}
              onClick={run("merge", (w) => w.merge())}
              cta="Merge"
            />
            <Action
              title="Deposit"
              hint="Public XLM (stroops) → your receiving balance."
              disabled={busy !== null || !view?.registered}
              busyLabel={busy === "deposit" ? "Working…" : null}
              onClick={run("deposit", (w) => w.deposit(BigInt(depositAmt)))}
              cta="Deposit"
            >
              <input className={inputCls} value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)} />
            </Action>
            <Action
              title="Withdraw"
              hint="Spendable → public XLM (to yourself)."
              disabled={busy !== null || !view?.registered}
              busyLabel={busy === "withdraw" ? "Proving…" : null}
              onClick={run("withdraw", (w) => w.withdraw(BigInt(withdrawAmt)))}
              cta="Withdraw"
            >
              <input className={inputCls} value={withdrawAmt} onChange={(e) => setWithdrawAmt(e.target.value)} />
            </Action>
          </section>

          <section className="rounded border border-neutral-800 p-4">
            <h3 className="mb-1 font-medium">Confidential transfer</h3>
            <p className="mb-3 text-xs text-neutral-400">
              Send to another registered account&apos;s receiving balance — amount stays private.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className={`${inputCls} flex-1`}
                placeholder="recipient G… address"
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value)}
              />
              <input className={`${inputCls} sm:w-28`} value={transferAmt} onChange={(e) => setTransferAmt(e.target.value)} />
              <button
                onClick={run("transfer", (w) => w.transfer(transferTo.trim(), BigInt(transferAmt)))}
                disabled={busy !== null || !view?.registered || !transferTo.trim()}
                className="rounded bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy === "transfer" ? "Proving…" : "Send"}
              </button>
            </div>
          </section>

          <EventsPanel wallet={wallet} />

          <button
            onClick={run("refresh", async () => {})}
            disabled={busy !== null}
            className="text-sm text-neutral-400 underline hover:text-neutral-200 disabled:opacity-50"
          >
            {busy === "refresh" ? "Syncing…" : "Sync from RPC events"}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-6 rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>
      )}

      <LogPanel logs={logs} />

      <footer className="mt-10 text-xs text-neutral-600">
        token {short(DEPLOYMENT.contracts.token)} · verifier {short(DEPLOYMENT.contracts.verifier)} · auditor{" "}
        {short(DEPLOYMENT.contracts.auditor)}
      </footer>
    </main>
  );
}

const inputCls =
  "rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-emerald-600";

function Balances({ view }: { view: WalletView | null }) {
  if (!view) return null;
  return (
    <section className="rounded border border-neutral-800 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-neutral-400">{view.address}</span>
        {view.matchesChain !== null && (
          <span
            className={`rounded px-2 py-0.5 text-xs ${
              view.matchesChain ? "bg-emerald-900 text-emerald-300" : "bg-red-900 text-red-300"
            }`}
            title="Local reconstruction re-committed and compared to on-chain commitments"
          >
            {view.matchesChain ? "state matches chain ✓" : "state mismatch ✗"}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Spendable" value={view.spendable.toString()} />
        <Stat label="Receiving" value={view.receiving.toString()} />
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        {view.registered ? `synced through ledger ${view.syncedLedger}` : "not registered yet"}
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-2xl">{value}</div>
    </div>
  );
}

function Action(props: {
  title: string;
  hint: string;
  cta: string;
  disabled: boolean;
  busyLabel: string | null;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded border border-neutral-800 p-4">
      <h3 className="font-medium">{props.title}</h3>
      <p className="mb-3 mt-0.5 text-xs text-neutral-400">{props.hint}</p>
      <div className="flex items-center gap-2">
        {props.children}
        <button
          onClick={props.onClick}
          disabled={props.disabled}
          className="rounded bg-neutral-800 px-3 py-2 text-sm font-medium hover:bg-neutral-700 disabled:opacity-50"
        >
          {props.busyLabel ?? props.cta}
        </button>
      </div>
    </div>
  );
}

function LogPanel({ logs }: { logs: string[] }) {
  if (logs.length === 0) return null;
  return (
    <pre className="mt-6 max-h-56 overflow-auto rounded border border-neutral-900 bg-black/40 p-3 text-xs text-neutral-400">
      {logs.join("\n")}
    </pre>
  );
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function short(id: string): string {
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}
