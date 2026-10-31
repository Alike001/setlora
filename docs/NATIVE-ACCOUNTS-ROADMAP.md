# Native Portaldot accounts and recipient activation — research plan

**Status: research / not implemented.** Setlora's deployed fixed-token Solidity settlement uses 20-byte EVM recipient addresses. A Portaldot native `AccountId32` / SS58 account is **not** automatically an EVM recipient. Do not advertise native wallet payments, sponsored activation, mapped-account custody or atomic native/EVM batches until independently tested on V3.

## Goal

A sender should be able to understand whether a recipient is able to receive the selected asset, and eventually support either native or EVM wallet destinations without putting funds in an unintended mapped account.

## Acceptance stages

1. **Document the chain-specific mapping.** Retrieve the V3 runtime metadata, account mapping implementation, accepted SS58 prefix and EVM `H160` mapping behavior. Test EVM-to-native and native-to-EVM calculations with two controlled wallets. Never assume a generic Polkadot or other chain's address mapping is valid on V3.
2. **Read-only asset-account checks.** For test asset ID `7777` (pUSD), compare `assets.account(7777, AccountId32)` and `system.account(AccountId32)` for funded, unfunded and not-yet-created recipients. Record how the runtime represents `isSufficient`, minimum balance, reference counters and account creation. A zero native balance alone must not be used to declare an account unable to receive a token.
3. **Failure-case simulations.** Try a read-only EVM transfer simulation to an unready recipient, a ready recipient and a deliberately invalid address. Confirm Setlora refuses to approve the blocked batch and explains what the user must do. Repeat with a fresh account and network restart where feasible.
4. **Native wallet exploration.** Identify a V3-compatible injected account API, explicit permission flow and native transfer extrinsics. Prove connect/disconnect, account/network changes and read-only asset balances. Avoid repurposing the EVM contract's `address[]` interface for SS58 destinations.
5. **Native asset transfer proof.** With two independent wallets using test tokens only, demonstrate a V3 native `assets.transfer` (or the supported alternative), capture native transaction events and verify the recipient and exact units. Keep native and EVM transaction histories distinct until a well-defined unified receipt exists.
6. **Activation and sponsorship feasibility.** Confirm which V3 extrinsics exist (for example `assets.touch` or privileged `touchOther`) and who is allowed to call them, deposits required and whether an unprivileged sponsor can pay activation costs. Any sponsorship must have explicit user approval, limits, accounting and failure recovery. No silent top-up or custody.
7. **Interoperability gate.** Define safe behavior for a mixed EVM/native recipient batch. A Solidity `settle(address[])` transaction cannot be called cross-environment-atomic by default. Offer separately verified routes unless Portaldot V3 supplies and testing proves an atomic mechanism.

## Next implementation slice

Start with a **read-only native address and account-readiness explorer** separate from the payment form. It should decode SS58 safely, identify the selected network, display evidence-backed asset-account state, and clearly mark unsupported or unknown cases. No financial signatures, funding or activation yet.

## Sources to verify against the V3 chain

- Portaldot Developer **v1** storage interface for assets: https://portaldot-dev.readthedocs.io/en/latest/module-interface/storage/assets.html
- Portaldot Developer **v1** assets extrinsics (`transfer`, `touch`, `touchOther`): https://portaldot-dev.readthedocs.io/en/latest/module-interface/extrinsics/assets.html
- Portaldot V3 console / runtime metadata (prefer current connected-chain metadata for authoritative function and type availability): https://node-console.portaldot.dev/

**Caveat:** Public documentation above is labelled *v1*. It is a discovery aid, not proof of the deployed V3 runtime's mapping or privileged-operation behavior. Read actual V3 chain metadata and test behavior before implementing claims.
