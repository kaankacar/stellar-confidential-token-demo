# Confidential Token — Live Demo Guide

A presenter-ready walkthrough of OpenZeppelin's Confidential Token on Stellar,
running **live on testnet** with Nethermind's UltraHonk verifier. Built for the
OZ × Stellar Developer Preview X Live.

> Testnet only. Contracts + verifier + circuits are unaudited. No real value.

![Confidential Token demo — the full lifecycle on testnet](media/demo.gif)

*(`pnpm demo` recorded end-to-end on testnet. Higher-quality `media/demo.mp4`; replayable source `media/demo.cast`.)*

## Our live deployment (testnet)

| Contract | ID | Explorer |
|----------|----|----------|
| token | `CCJM3DHVL6G3H36GTB37RADYDGGWRPRIP45AGDV3DL5QD4IKKAVYIFEA` | [stellar.expert](https://stellar.expert/explorer/testnet/contract/CCJM3DHVL6G3H36GTB37RADYDGGWRPRIP45AGDV3DL5QD4IKKAVYIFEA) |
| verifier (UltraHonk VK registry) | `CDEZ5STEQCZEUXIH4AMLRRAZRY6H4V4N47MHAZYKH5AZCARR3KYAQKB3` | [stellar.expert](https://stellar.expert/explorer/testnet/contract/CDEZ5STEQCZEUXIH4AMLRRAZRY6H4V4N47MHAZYKH5AZCARR3KYAQKB3) |
| auditor (compliance key registry) | `CAOJVT7YZRM5AQWEZVGWRI7PNGDMRJ2WYHGJZ4CWQS4G6Z3N2PABM6VO` | [stellar.expert](https://stellar.expert/explorer/testnet/contract/CAOJVT7YZRM5AQWEZVGWRI7PNGDMRJ2WYHGJZ4CWQS4G6Z3N2PABM6VO) |
| underlying (native XLM SAC) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` | — |

Recorded in `deployments/testnet.json`. Regenerate with `pnpm deploy:contracts`
(needs the `admin` stellar CLI identity, funded via friendbot).

## Two ways to demo

### A) Terminal walkthrough — `pnpm demo`  ← recommended for the Live

A narrated, nine-beat run on the live testnet. Every operation generates a real
UltraHonk proof in-process and the verifier checks it on-chain; balances are
reconstructed from RPC events and re-checked against on-chain commitments.

```bash
pnpm demo                # run straight through (~4–6 min, all proofs + txs)
DEMO_PAUSE=1 pnpm demo   # presenter mode: pause for <Enter> between beats
```

Each beat prints a Stellar Expert link so the audience can verify on-chain in
real time. Fresh accounts are minted each run, so you can re-run it live safely.

### B) Web app — live at https://stellar-confidential-token-demo.vercel.app

(or run locally: `pnpm dev` → http://localhost:3000)

Three personas, proofs generated **in the browser** (bb.js):
- **`/wallet`** — connect Freighter, run the five operations.
- **`/verify`** — selective-disclosure receiver (no wallet).
- **`/auditor`** — decrypt transfer amounts with the registered auditor key.

(Already pointed at the deployment above via `packages/app/lib/deployment.ts`.)

## The nine beats — and what to say at each

1. **The deployed system.** Three contracts, live now. "This isn't a slide — open
   the explorer." The verifier is a generic on-chain UltraHonk checker; the token
   is a standard SEP-41 with a confidential extension.

2. **Register (×2).** Each account binds Grumpkin keys with a ZK proof the
   verifier accepts on-chain. "Registration itself is proven."

3. **Deposit + merge.** 1000 public XLM enters the confidential pool. `merge` is a
   homomorphic point-add — no proof needed.

4. **REVEAL ① — what the chain stores.** Read Alice's on-chain balance: it's a
   Pedersen commitment `C = v·G + r·H`, a 64-byte curve point. "The network sees
   this. It encodes 1000 and reveals nothing. Only Alice's keys open it."

5. **Confidential transfer (400).** The proof asserts no overspend, value
   conserved, correct ownership — "and the amount never touches the chain."

6. **REVEAL ② — the public record.** Show the entire transfer event: ephemeral
   point, blinded amount, auditor ciphertexts. "This is everything an observer
   gets. Find the 400. You can't."

7. **COMPLIANCE — the auditor.** A designated auditor (key registered on-chain)
   decrypts the transfer to 400 and Alice's post-balance to 600; both encryption
   channels agree. "Auditability without a public ledger of amounts — the
   enterprise story."

8. **DISCLOSURE — prove one fact to one party.** Bob proves off-chain to a
   one-time receiver: *"this on-chain transfer paid me exactly 400."* Verified
   against the live chain with a pinned verification key — no contract call.

9. **Withdraw (400).** Confidential → public XLM, again proven on-chain. Value
   leaves the pool; the lifecycle closes.

## What this proves for the Preview

- The OZ Confidential Token + Nethermind UltraHonk verifier work **end-to-end on
  Stellar testnet today** — register → deposit → merge → transfer → withdraw,
  every transition verified on-chain.
- Both compliance channels in the memo are real and demoable: **dual-auditor
  decryption** and **off-chain selective disclosure**.
- An app builder can drive the whole thing from `@ctd/sdk` over plain Soroban RPC
  — no indexer.

## Verify it yourself (offline correctness)

```bash
pnpm test:sdk          # full SDK suite incl. real proof generation + tamper-rejection
pnpm e2e               # the lifecycle, asserting state matches chain at each step
pnpm e2e:disclosure    # disclosure + replay/forgery rejection paths
```

## Notes / gotchas

- Built against **stellar CLI 26** — `deploy.ts` drops the old `--optimize=false`
  flag (now a valueless switch; the wasm is already optimized).
- Amounts are in stroops of the underlying SAC; the demo uses 1000/400 as units.
- No indexer by design: RPC `getEvents` serves ~7 days. The state engine persists
  decrypted openings locally and re-syncs. (See main README's trade-off section.)
