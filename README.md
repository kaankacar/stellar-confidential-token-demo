# Confidential Token Demo (Stellar / Soroban)

A working demo of a **confidential token on Stellar**: balances are Pedersen
commitments on the Grumpkin curve, and every state transition is proven with an
**UltraHonk zero-knowledge proof** verified on-chain. Built on the
[OpenZeppelin `stellar-contracts`](https://github.com/OpenZeppelin/stellar-contracts)
`feat/confidential-verifier-ultrahonk` branch.

> ⚠️ **Not production ready.** The UltraHonk verifier backend and the circuits
> are unaudited. Testnet only; do not use with real value.

## What it does

Amounts and balances are never revealed on-chain. A balance is a commitment
`C = v·G + r·H`; the network only ever sees commitments and ZK proofs that the
arithmetic is correct (no overspend, conserved value, correct ownership).

Each account holds **two** balances:

- a **spendable** balance (what you can send/withdraw), and
- a **receiving** balance (where deposits and incoming transfers land).

`merge` folds receiving into spendable (a homomorphic point add — no proof).
Operations:

| Op | Proof? | Effect |
|----|--------|--------|
| `register` | ✔ | Bind your Grumpkin keys to the contract |
| `deposit` | — | Move public SEP-41 tokens → your receiving balance |
| `merge` | — | Fold receiving → spendable |
| `withdraw` | ✔ | Spendable → public SEP-41 tokens |
| `confidential_transfer` | ✔ | Spendable → another account's receiving |

Transfers also emit **dual auditor ciphertexts** (sender + recipient channels),
so a designated auditor holding the registered Grumpkin key can decrypt amounts.

## Architecture

```
contracts/                Rust/Soroban (separate Cargo workspace)
  token/                  ConfidentialToken (NoHooks) — the demo token
  verifier/               UltraHonk VK registry (verify_proof)
  auditor/                Grumpkin auditor-key registry
packages/
  sdk/      @ctd/sdk      crypto · witness · proving · chain · state
  app/      @ctd/app      Next.js demo front-end (Freighter wallet)
scripts/                  deploy.ts · e2e.ts  (testnet)
```

The SDK layers:

- **crypto** — Grumpkin (`@noble/curves`) and Poseidon2 (`@zkpassport/poseidon2`
  raw permutation), with generators, domain tags, and derivations matching the
  Noir `lib.nr` exactly. Validated by executing the real circuits (`noir_js`).
- **witness** — per-circuit input builders (register / withdraw / transfer),
  mirroring each circuit's public-input order.
- **proving** — UltraHonk via `bb.js` with a **keccak transcript** (mandatory:
  the on-chain verifier uses keccak256 Fiat–Shamir).
- **chain** — RPC client, the `{payload, proof}` XDR envelopes, op submitters,
  and event ingestion.
- **state** — RPC-only balance reconstruction with local persistence.

## The central trade-off: RPC-only, 7-day retention

This demo has **no indexer**. Client state is reconstructed straight from the
Soroban RPC `getEvents` API. But the protocol's spendable secrets (`v`, `r`)
live **only in events** — the chain stores commitments, not openings. The RPC
serves only ~7 days of history (testnet `ledgerRetentionWindow` ≈ 120 960
ledgers).

Consequences, handled deliberately:

- The state engine **persists decrypted openings locally** and tracks a sync
  cursor. Local persistence is therefore *load-bearing for correctness*, not
  just speed.
- You **recover your spendable balance** from the most recent withdraw/transfer
  event's `b_tilde`+`sigma` alone (it encodes the resulting value), so a regular
  spender is robust within the window.
- The **receiving balance is a running sum**: if an incoming-transfer event
  ages out before you sync, that credit's opening is unrecoverable (the funds
  can still be `merge`d, but the post-merge spendable value is then unknown).
  **Sync at least once per retention period.** A production system would run an
  indexer or archive events; this demo intentionally does not, to show the bare
  RPC model and its limits.

`StateEngine.verifyAgainstChain()` re-commits the local openings and checks them
against the on-chain commitments, so divergence is detected, never silently
spent.

## Deployed (testnet)

`deployments/testnet.json` (regenerate with `scripts/deploy.ts`):

| Contract | ID |
|----------|----|
| token | `CBF64DEOVQAXJFBSNGFEUT2AH4H7K5JBY3ZYJ5GVEINMNSDISWRG5N3F` |
| verifier | `CDCET36PIS44DWJM5UQSSI4ZHGRDSBIIQW4G4ALPYK3Y6FEQGY5ZWFXL` |
| auditor | `CA4II62E35TQKPGHCPBD6EBAS732GSGS6H37UUWKEDHR4YTBVMPHVY4L` |
| underlying | native XLM SAC `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |

## Prerequisites

- Node ≥ 20, pnpm 10
- For rebuilding contracts: Rust stable + `wasm32v1-none`, `stellar` CLI ≥ 25.2
- For regenerating circuit artifacts: `nargo` 1.0.0-beta.9, `bb` 0.87.0
- A local checkout of `OpenZeppelin/stellar-contracts` @
  `feat/confidential-verifier-ultrahonk` at
  `../stellar-contracts-cv-ultrahonk` (path dependency for the contracts)

## Build & test

```bash
pnpm install
pnpm build:contracts        # stellar contract build → packages/sdk/contracts/*.wasm
pnpm build:sdk              # tsc → packages/sdk/dist
pnpm test:sdk               # crypto/proof/payload tests (tsx)

# Testnet (uses the `admin` stellar CLI identity as deployer):
pnpm --filter @ctd/sdk exec tsx ../../scripts/deploy.ts
pnpm --filter @ctd/sdk exec tsx ../../scripts/e2e.ts

pnpm dev                    # run the Next.js demo app
```

### SDK test suite

The tests are the real correctness story:

- `test/parity.mjs` — builds each witness from SDK crypto and has the **actual
  circuit** (via `noir_js`) solve it; tamper cases must be rejected.
- `test/prove.mjs` — generates + verifies real UltraHonk proofs (keccak).
- `test/payload.mjs` — XDR envelope round-trip (Symbol-keyed contracttype maps,
  flat 64-byte points).
- `test/smoke.mjs` — curve / Poseidon2 / serialization sanity.

### Web app (`@ctd/app`)

A Next.js app that connects Freighter, derives your confidential keys, and runs
the five operations with **proofs generated in the browser** (bb.js). Balances
are reconstructed locally from RPC events and shown with a "matches chain" badge
(`verifyAgainstChain`).

Browser proving needs cross-origin isolation (SharedArrayBuffer); the app sets
`COOP: same-origin` + `COEP: credentialless` in `next.config.mjs`. The
confidential `sk` is cached in `localStorage` for the demo — a production wallet
would derive it from a wallet signature and store it encrypted.

```bash
pnpm build:sdk && pnpm dev   # http://localhost:3000
```

**bb.js is *not* bundled by webpack.** Its pre-built browser bundle declares a
top-level `__webpack_exports__` that collides with webpack's own module runtime,
and it spawns its wasm Web Worker via
`new Worker(new URL('./main.worker.js', import.meta.url))` (marked
`webpackIgnore`) — so once bundled into a hashed `_next` chunk the worker can't
be found and proving hangs forever. Instead, `scripts/vendor-bb.mjs` copies
bb.js's `dest/browser/` into `public/vendor/bb/` (run automatically by the app's
`predev`/`prebuild`), the SDK prover loads it as **native ESM** from that stable
path (`lib/bb-loader.ts` overrides `setUltraHonkBackendLoader`), and the bare
`@aztec/bb.js` specifier is aliased away in the client webpack config. The
vendored copy is git-ignored and regenerated from `node_modules` on each build.

## What's verified

- **Crypto / witness / prover** — `noir_js` solves SDK-built witnesses against
  the real circuits; proofs verify locally with the keccak transcript. ✔
- **Contracts** — build with `stellar contract build`. ✔
- **On-chain, testnet** — `scripts/e2e.ts` ran the full
  register → deposit → merge → transfer → withdraw flow; every proof was
  accepted by the on-chain verifier and local state matched the chain at each
  step. ✔
- **In-browser proving** — verified in Chrome: connect Freighter → derive keys →
  build a register witness → bb.js generates a **14 592-byte keccak proof** and
  verifies it locally, all client-side (~1.5 s). The RPC-only state sync
  (`getEvents` + account simulate) also runs in the browser. ✔
- **App** — `next build` succeeds and the page is cross-origin isolated
  (`crossOriginIsolated === true`). The only path not exercised by automation is
  the **Freighter-signed on-chain submit** from the browser; its XDR/submit code
  is shared with the Node `e2e.ts` above — only the signer (Freighter vs
  keypair) differs.

## License

MIT.
