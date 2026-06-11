/**
 * Deployment the app talks to. Public values only (no auditor secret). Mirror
 * of deployments/testnet.json — update after a redeploy.
 */
import { Networks } from "@stellar/stellar-sdk";

export const DEPLOYMENT = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  /** Ledger the token was deployed at — the first-sync start point. */
  deployedAtLedger: 3013364,
  /** All accounts in this demo register under this auditor id. */
  auditorId: 0,
  contracts: {
    token: "CBF64DEOVQAXJFBSNGFEUT2AH4H7K5JBY3ZYJ5GVEINMNSDISWRG5N3F",
    verifier: "CDCET36PIS44DWJM5UQSSI4ZHGRDSBIIQW4G4ALPYK3Y6FEQGY5ZWFXL",
    auditor: "CA4II62E35TQKPGHCPBD6EBAS732GSGS6H37UUWKEDHR4YTBVMPHVY4L",
    underlying: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  },
} as const;
