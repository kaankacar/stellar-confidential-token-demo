/**
 * Deployment the app talks to. Mirror of deployments/testnet.json — update
 * after a redeploy.
 *
 * ⚠️ Demo-only exception: `auditorSecretHex` is the auditor's Grumpkin SECRET
 * key, published here so anyone can play the auditor persona on /auditor. In
 * any real deployment this never leaves the auditor's machine — only the
 * public key `K_aud = k·H` goes on-chain (auditor contract registry).
 */
import { Networks } from "@stellar/stellar-sdk";

export const DEPLOYMENT = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  /** Ledger the token was deployed at — the first-sync start point. */
  deployedAtLedger: 3171184,
  /** All accounts in this demo register under this auditor id. */
  auditorId: 0,
  /** Auditor Grumpkin secret `k` for auditor id 0 (see header warning). */
  auditorSecretHex: "0x007c7c84441b1d3f4b1a9b198188f045008c4a9ab38de862a3cab5f7320d59c4",
  contracts: {
    token: "CCJM3DHVL6G3H36GTB37RADYDGGWRPRIP45AGDV3DL5QD4IKKAVYIFEA",
    verifier: "CDEZ5STEQCZEUXIH4AMLRRAZRY6H4V4N47MHAZYKH5AZCARR3KYAQKB3",
    auditor: "CAOJVT7YZRM5AQWEZVGWRI7PNGDMRJ2WYHGJZ4CWQS4G6Z3N2PABM6VO",
    underlying: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  },
} as const;
