# Setlora — Settlement contract v0.1

Status: **locally testable, NOT deployed, not audited, not production-ready**.

## Goal

Allow one paying EVM wallet to approve a batch of up to 10 invoice payments in a fixed ERC-20-compatible token. Either every transfer succeeds, or the entire transaction reverts. Settlement is tracked by payer and invoice number.

## Scope and identity

- Payment token is an immutable contract constructor argument; production target is Portaldot V3 test pUSD asset adapter, address `0x00001E6100000000000000000000000000010000` **subject to live behavior verification**.
- The paying party is always `msg.sender`. No operator, service, or backend can spend on its behalf.
- Every invoice has a nonzero **uint256 number** assigned by the payer's organization. Distinct organizations/wallets can use the same number.
- Avoid reusing an invoice number even when correcting data. Use a new number and document the correction separately.
- Only a **payer + invoice number** is remembered, not arbitrary document text or personal details.
- A compact bitmap stores settled flags: invoice number `n` belongs to word `n >> 8`, bit `n & 255`; 256 invoice flags share one word.

## Contract actions

1. Verify arrays have equal lengths, between 1 and 10 records.
2. Reject invalid recipient/amount/number or previously-settled numbers, including duplicates inside the current batch.
3. Mark all selected invoice flags.
4. Call `transferFrom(payer, recipient, amount)` separately for each record. Requires a prior token allowance, ideally exact total.
5. Emit one `InvoiceSettled` event per record and a `BatchSettled` event for the batch.
6. If any call fails/reverts, all marks and successful transfers in this EVM transaction revert.

## Trust limitations

- The paying wallet must independently check the intended recipients, amounts, and invoice numbers before signing.
- The contract does **not** authenticate the invoice issuer, approve commercial obligations, prevent the payer from creating different numbers for the same real invoice, or prevent payments through other contracts or wallets.
- ERC-20 `transferFrom` returning `true` is assumed to represent standard full-amount transfer behavior. Fee-on-transfer or nonstandard tokens are not supported by this v0.1 design.
- Every recipient address and amount is public blockchain data. Do not expose invoice descriptions or personal information in public UI/receipts.
- During RPC failure, mark the operation `unknown` until a transaction receipt or on-chain settled flag is checked. Do not automatically resubmit a payment.
- The constructor intentionally does not require `tokenAddress.code.length > 0` because native precompiles may behave differently from normal EVM contracts. Live `transferFrom`, `approve`, and `balanceOf` tests remain mandatory.
- `pallet-revive` storage and code deposits are not equivalent to local gas. Check cost and funded wallet before deployment.

## Test evidence

Package includes **9 tests intended for local Foundry execution**. These tests have not been executed by the assistant here; run `forge test -vv` and inspect the outcome.

## Ship gate

Do not deploy or claim production readiness before: local tests pass, contract is reviewed, live V3 precompile semantics are checked, a testnet deployment budget is understood, and an explicitly-authorized test-wallet transaction can be verified end to end.
