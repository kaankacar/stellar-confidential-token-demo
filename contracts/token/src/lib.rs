//! Confidential Token demo contract.
//!
//! Wraps the `ConfidentialToken` implementation from `stellar-tokens`
//! (OpenZeppelin, `feat/confidential-verifier-ultrahonk`) with no extension
//! hooks. At construction it binds three collaborators, all immutable for the
//! address-as-field value and the underlying asset:
//!
//! * `underlying_asset` — the SEP-41 token whose reserves back every
//!   confidential balance. MUST have exact-transfer semantics (no
//!   fee-on-transfer, no rebasing).
//! * `verifier` — the [`ConfidentialVerifier`] registry holding one UltraHonk
//!   verification key per circuit type.
//! * `auditor` — the [`ConfidentialAuditor`] registry holding Grumpkin auditor
//!   public keys, indexed by `auditor_id`.
//!
//! # ⚠️ Not Production Ready
//!
//! The UltraHonk verifier backend and the circuits the verification keys are
//! derived from are **unaudited**. Do not deploy anywhere handling real value.
#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Bytes, Env};
// `ConfidentialAccount` / `SpenderDelegation` / `Bytes` are referenced by the
// default trait-method bodies that `#[contractimpl(contracttrait)]` generates
// for the read endpoints and the proof-carrying entry points, so they must be
// in scope here even though this file never names them directly.
use stellar_tokens::confidential::{
    storage as token_storage, ConfidentialAccount, ConfidentialToken, NoHooks, SpenderDelegation,
};

#[contract]
pub struct ConfidentialTokenContract;

#[contractimpl]
impl ConfidentialTokenContract {
    /// Binds the underlying SEP-41 asset, the verifier registry, and the
    /// auditor registry, then freezes the contract's address-as-field value
    /// used to domain-separate every account's viewing key.
    pub fn __constructor(e: &Env, underlying_asset: Address, verifier: Address, auditor: Address) {
        token_storage::set_underlying_asset(e, &underlying_asset);
        token_storage::set_verifier(e, &verifier);
        token_storage::set_auditor(e, &auditor);
        token_storage::set_address_as_field_element(e);
    }
}

#[contractimpl(contracttrait)]
impl ConfidentialToken for ConfidentialTokenContract {
    type Hooks = NoHooks;
}
