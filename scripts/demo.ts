/**
 * Presenter CLI — a narrated, on-chain walkthrough of the confidential token,
 * built for a live demo (e.g. the OZ × Stellar X Live).
 *
 * It runs the SAME pipeline the e2e scripts verify, but stops at each step to
 * SHOW the audience what is — and is not — visible on-chain:
 *
 *   1. Deployed contracts (testnet, with Stellar Expert links)
 *   2. Two fresh accounts register their confidential keys (on-chain ZK proof)
 *   3. Alice deposits public XLM and merges into her spendable balance
 *   4. REVEAL: the chain stores only a Pedersen commitment — a 64-byte curve
 *      point — never the amount. The holder alone opens it to 1000.
 *   5. Alice → Bob confidential transfer (on-chain ZK proof)
 *   6. REVEAL: the public transfer event is all ciphertext. Find the amount.
 *   7. COMPLIANCE: the designated auditor — and only the auditor — decrypts the
 *      transfer to 400 (both channels agree).
 *   8. DISCLOSURE: Bob proves to a one-time receiver "this transfer paid me
 *      exactly 400", off-chain, verified against the live chain with a pinned VK.
 *   9. Bob withdraws 400 back to public XLM (on-chain ZK proof).
 *
 * Usage:
 *   pnpm demo                 # run straight through
 *   DEMO_PAUSE=1 pnpm demo    # pause for <Enter> between steps (presenter mode)
 *
 * Requires a deployment (run `pnpm deploy:contracts` first) and the `stellar`
 * CLI only indirectly (this script talks to testnet over RPC + friendbot).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Keypair } from "@stellar/stellar-sdk";

import { REPO_ROOT, RPC_URL, PASSPHRASE, loadDeployment, friendbotFund } from "./_shared.js";
import { ChainClient, keypairSigner, type Signer, type OnChainAccount } from "../packages/sdk/src/chain/client.js";
import { deriveKeys, type KeyPair } from "../packages/sdk/src/crypto/keys.js";
import { addressToField } from "../packages/sdk/src/crypto/address.js";
import { randomScalar, toHex32 } from "../packages/sdk/src/crypto/field.js";
import { pointCoords, type Point } from "../packages/sdk/src/crypto/grumpkin.js";
import { deriveEphemeralRE } from "../packages/sdk/src/crypto/poseidon2.js";
import { buildRegisterWitness } from "../packages/sdk/src/witness/register.js";
import { buildTransferWitness } from "../packages/sdk/src/witness/transfer.js";
import { buildWithdrawWitness } from "../packages/sdk/src/witness/withdraw.js";
import { CircuitProver } from "../packages/sdk/src/proving/prover.js";
import { loadCircuit } from "../packages/sdk/src/proving/artifacts.js";
import {
  submitRegister, submitDeposit, submitMerge, submitTransfer, submitWithdraw,
} from "../packages/sdk/src/chain/contract.js";
import { StateEngine, MemoryStore } from "../packages/sdk/src/state/index.js";
import { fetchEvents, type TransferEvent } from "../packages/sdk/src/chain/events.js";
import { auditTransfer } from "../packages/sdk/src/auditor/index.js";
import { generateRecipientKeys, newDisclosureRequest } from "../packages/sdk/src/disclosure/recipient.js";
import { proveRecipientDisclosure } from "../packages/sdk/src/disclosure/prove.js";
import { verifyDisclosure } from "../packages/sdk/src/disclosure/verify.js";
import type { DisclosureBundle } from "../packages/sdk/src/disclosure/types.js";

const AUDITOR_ID = 0;
const DEPOSIT = 1000n;
const TRANSFER = 400n;
const EXPLORER = "https://stellar.expert/explorer/testnet";
const PAUSE = process.env.DEMO_PAUSE === "1" || process.env.DEMO_PAUSE === "true";

// ---- tiny terminal helpers (no deps) --------------------------------------
const useColor = !process.env.NO_COLOR && stdout.isTTY !== false;
const c = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s: string) => c("1", s);
const dim = (s: string) => c("2", s);
const cyan = (s: string) => c("36", s);
const green = (s: string) => c("32", s);
const yellow = (s: string) => c("33", s);
const magenta = (s: string) => c("35", s);
const red = (s: string) => c("31", s);

const rl = PAUSE ? createInterface({ input: stdin, output: stdout }) : null;
let stepNo = 0;
async function step(title: string, subtitle?: string): Promise<void> {
  stepNo += 1;
  const bar = "─".repeat(Math.max(0, 72 - title.length - 5));
  stdout.write(`\n${bold(cyan(`▐ ${stepNo}. ${title}`))} ${dim(bar)}\n`);
  if (subtitle) stdout.write(`${dim(subtitle)}\n`);
  if (rl) await rl.question(dim("   ⏎ "));
}
const say = (s = "") => stdout.write(`   ${s}\n`);
const txLink = (h: string) => dim(`${EXPLORER}/tx/${h}`);
const cLink = (id: string) => dim(`${EXPLORER}/contract/${id}`);
const aLink = (g: string) => dim(`${EXPLORER}/account/${g}`);
const short = (s: string, n = 6) => `${s.slice(0, n)}…${s.slice(-4)}`;
const pt = (p: Point): string => {
  const { x, y } = pointCoords(p);
  return `(x=${short(toHex32(x), 10)}, y=${short(toHex32(y), 10)})`;
};

async function freshAccount(label: string): Promise<{ kp: Keypair; signer: Signer }> {
  const kp = Keypair.random();
  await friendbotFund(kp.publicKey());
  say(`${bold(label)} = ${kp.publicKey()}`);
  say(aLink(kp.publicKey()));
  return { kp, signer: keypairSigner(kp.secret(), PASSPHRASE) };
}

async function main(): Promise<void> {
  const dep = loadDeployment();
  const client = new ChainClient({
    rpcUrl: RPC_URL,
    networkPassphrase: PASSPHRASE,
    contracts: { token: dep.contracts.token, verifier: dep.contracts.verifier, auditor: dep.contracts.auditor },
  });
  const addrF = addressToField(dep.contracts.token);
  const kAud: Point = await client.auditorKey(AUDITOR_ID);

  // Provers (one bb.js backend per circuit, reused across the run).
  const registerProver = new CircuitProver(loadCircuit("register"));
  const transferProver = new CircuitProver(loadCircuit("transfer"));
  const withdrawProver = new CircuitProver(loadCircuit("withdraw"));
  const ARTIFACTS = join(REPO_ROOT, "packages/disclosure/artifacts");
  const loadArtifact = (n: string) => JSON.parse(readFileSync(join(ARTIFACTS, n), "utf8"));
  const disclosureProver = new CircuitProver(loadArtifact("disclose_recipient.json"));
  const disclosurePinnedVk = new Uint8Array(Buffer.from(loadArtifact("disclose_recipient.vk.json").vkBase64, "base64"));

  stdout.write(`\n${bold(magenta("  CONFIDENTIAL TOKEN — live on Stellar testnet"))}\n`);
  stdout.write(`${dim("  Private balances + private amounts on a SEP-41 token, proven with UltraHonk ZK\n  proofs verified on-chain. OpenZeppelin contracts × Nethermind verifier.")}\n`);

  try {
    // ---------------------------------------------------------------- 1
    await step("The deployed system", "Three contracts, live on testnet right now — click through and verify.");
    say(`${bold("token")}     ${dep.contracts.token}`);
    say(`          ${cLink(dep.contracts.token)}`);
    say(`${bold("verifier")}  ${dep.contracts.verifier}  ${dim("(UltraHonk VK registry)")}`);
    say(`          ${cLink(dep.contracts.verifier)}`);
    say(`${bold("auditor")}   ${dep.contracts.auditor}  ${dim("(compliance key registry)")}`);
    say(`          ${cLink(dep.contracts.auditor)}`);
    say(`${bold("underlying")} ${dep.contracts.underlying}  ${dim("(native XLM SAC — the SEP-41 asset)")}`);

    // ---------------------------------------------------------------- 2
    await step("Two accounts register confidential keys", "Each register() carries a ZK proof the verifier checks on-chain.");
    const alice = await freshAccount("alice");
    const bob = await freshAccount("bob");
    const aliceKeys: KeyPair = deriveKeys(randomScalar(), addrF);
    const bobKeys: KeyPair = deriveKeys(randomScalar(), addrF);
    const aliceEngine = new StateEngine({ client, store: new MemoryStore(), keys: aliceKeys, address: alice.kp.publicKey(), fromLedger: dep.deployedAtLedger });
    const bobEngine = new StateEngine({ client, store: new MemoryStore(), keys: bobKeys, address: bob.kp.publicKey(), fromLedger: dep.deployedAtLedger });
    for (const [who, keys, acct] of [["alice", aliceKeys, alice], ["bob", bobKeys, bob]] as const) {
      const w = buildRegisterWitness(keys);
      say(dim(`  ${who}: generating UltraHonk proof in-process…`));
      const { proof } = await registerProver.prove(w.inputs);
      const r = await submitRegister(client, acct.signer, acct.kp.publicKey(), AUDITOR_ID, w, proof);
      say(`${green("✓")} ${who} registered — ${dim("on-chain proof OK")}  tx ${short(r.hash)}`);
      say(`     ${txLink(r.hash)}`);
    }

    // ---------------------------------------------------------------- 3
    await step("Alice deposits 1000 public XLM, then merges", "deposit: public SEP-41 → confidential receiving. merge: receiving → spendable (homomorphic, no proof).");
    const d = await submitDeposit(client, alice.signer, alice.kp.publicKey(), alice.kp.publicKey(), DEPOSIT);
    say(`${green("✓")} deposit ${DEPOSIT} — tx ${short(d.hash)}  ${txLink(d.hash)}`);
    const m = await submitMerge(client, alice.signer, alice.kp.publicKey());
    say(`${green("✓")} merge — tx ${short(m.hash)}  ${txLink(m.hash)}`);
    const aState = await aliceEngine.sync();
    const aVerify = await aliceEngine.verifyAgainstChain();
    say(`${green("✓")} alice spendable (decrypted locally) = ${bold(green(aState.spendable.v.toString()))}  ${dim(`state matches chain: ${aVerify.ok}`)}`);

    // ---------------------------------------------------------------- 4
    await step("REVEAL ①  — what the chain actually stores", "Read Alice's on-chain account directly. Her balance is a Pedersen commitment C = v·G + r·H.");
    const aliceOnChain = await client.confidentialBalance(alice.kp.publicKey()) as OnChainAccount;
    say(`${yellow("on-chain")} spendable_balance = ${yellow(pt(aliceOnChain.spendableBalance))}`);
    say(`         ${dim("↑ a 64-byte elliptic-curve point. It encodes 1000 — but reveals nothing.")}`);
    say(`${green("local")}    alice opens it to = ${bold(green(aState.spendable.v.toString()))}  ${dim("(only the holder's keys can)")}`);
    say(dim(`         verifyAgainstChain re-commits the local opening and matches the point ✓`));

    // ---------------------------------------------------------------- 5
    await step("Alice sends Bob 400 — confidentially", "confidential_transfer carries a ZK proof: no overspend, value conserved, correct ownership — amount never on-chain.");
    const cur = await aliceEngine.current();
    const tw = buildTransferWitness({ keys: aliceKeys, v: cur.spendable.v, r: cur.spendable.r, amount: TRANSFER, pvkB: bobKeys.PVK, kAudR: kAud, kAudS: kAud });
    say(dim("  generating transfer proof…"));
    const { proof: tProof } = await transferProver.prove(tw.inputs);
    const t = await submitTransfer(client, alice.signer, alice.kp.publicKey(), bob.kp.publicKey(), tw, tProof);
    say(`${green("✓")} transferred — ${dim("on-chain proof OK")}  tx ${short(t.hash)}`);
    say(`     ${txLink(t.hash)}`);
    const aAfter = await aliceEngine.sync();
    const bAfter = await bobEngine.sync();
    say(`${green("✓")} alice spendable = ${bold(green(aAfter.spendable.v.toString()))}  ${dim("(1000 − 400)")}`);
    say(`${green("✓")} bob receiving  = ${bold(green(bAfter.receiving.v.toString()))}  ${dim("(decrypted from the event, matches chain)")}`);

    // pull the public event for the next two reveals
    const { events } = await fetchEvents(client, { startLedger: dep.deployedAtLedger });
    const tEvent = events.find((e): e is TransferEvent => e.type === "transfer" && e.txHash === t.hash);
    if (!tEvent) throw new Error("transfer event not found over RPC");

    // ---------------------------------------------------------------- 6
    await step("REVEAL ②  — the public record of that payment", "This is the ENTIRE transfer event any observer sees over RPC. Find the 400.");
    say(`${yellow("R_e")}     ${yellow(pt(tEvent.rE))}        ${dim("ephemeral point")}`);
    say(`${yellow("v~")}      ${yellow(short(toHex32(tEvent.vTilde), 14))}   ${dim("blinded amount")}`);
    say(`${yellow("sigma")}   ${yellow(short(toHex32(tEvent.sigma), 14))}   ${dim("transcript tag")}`);
    say(`${yellow("v_audR")}  ${yellow(short(toHex32(tEvent.vAudR), 14))}   ${dim("auditor ciphertext (recipient channel)")}`);
    say(`${yellow("v_audS")}  ${yellow(short(toHex32(tEvent.vAudS), 14))}   ${dim("auditor ciphertext (sender channel)")}`);
    say(`${red("→ no plaintext amount appears anywhere. The 400 is unrecoverable without a key.")}`);

    // ---------------------------------------------------------------- 7
    await step("COMPLIANCE  — the auditor decrypts (and only the auditor)", "A designated auditor holds the Grumpkin key K_aud registered on-chain. With it, every transfer opens.");
    const k = BigInt(dep.auditor.secretHex.startsWith("0x") ? dep.auditor.secretHex : `0x${dep.auditor.secretHex}`);
    const audited = auditTransfer(k, tEvent);
    say(`${green("✓")} auditor decrypts amount        = ${bold(green(audited.amount.toString()))}`);
    say(`${green("✓")} auditor decrypts sender balance = ${bold(green(audited.senderBalance.toString()))}  ${dim("(Alice's 600 after the send)")}`);
    say(`${green("✓")} sender & recipient channels agree: ${bold(green(String(audited.channelsAgree)))}`);
    say(dim("  This is the enterprise story: regulators get auditability without a public ledger of amounts."));

    // ---------------------------------------------------------------- 8
    await step("DISCLOSURE  — Bob proves one fact to one party, off-chain", "Bob proves to a one-time receiver: \"this on-chain transfer paid me exactly 400\" — no contract call, verified against live chain with a pinned VK.");
    const receiver = generateRecipientKeys();
    const request = newDisclosureRequest(receiver);
    const bundle = await proveRecipientDisclosure({ keys: bobKeys, event: tEvent, request, prover: disclosureProver });
    const wire = JSON.parse(JSON.stringify(bundle)) as DisclosureBundle;
    say(dim(`  bundle: ${(wire.proof.length - 2) / 2}-byte proof, references tx ${short(wire.refE.txHash)} (travels as copy/paste text)`));
    const verdict = await verifyDisclosure({ client, bundle: wire, request, keys: receiver, prover: disclosureProver, pinnedVk: disclosurePinnedVk });
    for (const s of verdict.steps) say(dim(`  · ${s}`));
    say(`${green("✓")} receiver learns: account ${short(verdict.disclosingAccount)} (${verdict.role}) — amount ${bold(green(verdict.amount.toString()))}`);

    // ---------------------------------------------------------------- 9
    await step("Bob withdraws 400 back to public XLM", "withdraw: confidential spendable → public SEP-41, again with an on-chain ZK proof.");
    await submitMerge(client, bob.signer, bob.kp.publicKey());
    const bSpend = await bobEngine.sync();
    const ww = buildWithdrawWitness({ keys: bobKeys, v: bSpend.spendable.v, r: bSpend.spendable.r, amount: TRANSFER, kAudS: kAud });
    say(dim("  generating withdraw proof…"));
    const { proof: wProof } = await withdrawProver.prove(ww.inputs);
    const w = await submitWithdraw(client, bob.signer, bob.kp.publicKey(), bob.kp.publicKey(), TRANSFER, ww, wProof);
    say(`${green("✓")} withdrew ${TRANSFER} — ${dim("on-chain proof OK")}  tx ${short(w.hash)}`);
    say(`     ${txLink(w.hash)}`);
    const bFinal = await bobEngine.sync();
    say(`${green("✓")} bob confidential spendable = ${bold(green(bFinal.spendable.v.toString()))}  ${dim("(back to 0 — value moved out to public XLM)")}`);

    // ---------------------------------------------------------------- recap
    stdout.write(`\n${bold(green("  ✅ Full confidential lifecycle — live on Stellar testnet."))}\n`);
    say(dim("  register → deposit → merge → confidential transfer → withdraw,"));
    say(dim("  every transition proven with an UltraHonk proof verified on-chain;"));
    say(dim("  amounts never public; auditor + selective disclosure for compliance."));
    say("");
    say(`${bold("token contract:")} ${cLink(dep.contracts.token)}`);
  } finally {
    await Promise.all([
      registerProver.destroy(), transferProver.destroy(), withdrawProver.destroy(), disclosureProver.destroy(),
    ]);
    rl?.close();
  }
}

main().catch((e) => {
  stdout.write(`\n${red("❌")} ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  rl?.close();
  process.exit(1);
});
