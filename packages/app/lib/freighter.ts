/**
 * Adapts the Freighter browser wallet to the SDK's {@link Signer} interface.
 */
import {
  isConnected,
  requestAccess,
  signTransaction,
} from "@stellar/freighter-api";
import type { Signer } from "@ctd/sdk";

import { DEPLOYMENT } from "./deployment";

export async function connectFreighter(): Promise<Signer> {
  const conn = await isConnected();
  if (!conn.isConnected) {
    throw new Error("Freighter not detected. Install the Freighter extension.");
  }
  const access = await requestAccess();
  if (access.error) throw new Error(String(access.error));
  const address = access.address;

  return {
    publicKey: address,
    async sign(txXdrBase64: string): Promise<string> {
      const res = await signTransaction(txXdrBase64, {
        networkPassphrase: DEPLOYMENT.networkPassphrase,
        address,
      });
      if (res.error) throw new Error(String(res.error));
      return res.signedTxXdr;
    },
  };
}
