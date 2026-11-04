# Setlora settlement specification

Status: **deployed and exercised on Portaldot V3 Testnet; not independently audited; no mainnet support**. This document describes [SetloraBatch.sol](../contracts/src/SetloraBatch.sol), not future native or cross-chain settlement.

## Identity and fixed token

- The constructor rejects only a zero token address (`InvalidToken`) and stores an immutable `ISetloraToken`. It deliberately does not require token bytecode because native asset precompiles can have special code semantics.
- The payer is always `msg.sender`. There is no administrator, custody account, operator payment entry point or issuer-authentication mechanism.
- Invoice numbers are nonzero `uint256` values. Uniqueness is scoped to the payer and this contract instance, not to an organization, recipient or real-world invoice.
- The deployed token is test pUSD, `0x00001E6100000000000000000000000000010000`, with 6 decimals. The contract takes integer base units and does not itself check decimals. The frontend checks six decimals and token identity.

## Validation and execution

`settle(uint256[] invoiceNumbers, address[] recipients, uint256[] amounts)` executes as follows:

1. Reject a nested call with `Reentered` if the `entered` lock is already set.
2. Require **1–10 invoices**, with all three arrays equal in length; otherwise revert `InvalidBatch`. `MAX_INVOICES` is `10`.
3. Set the reentrancy lock. For every row, reject invoice number zero, recipient zero or amount zero with `InvalidInvoice(index)`.
4. Check and mark each payer-scoped invoice bit. A previously marked bit reverts `AlreadySettled(invoiceNumber)`. Marking as validation proceeds also catches duplicates inside the current batch. No token call occurs until all rows are validated and marked.
5. Sum amounts using Solidity's checked `uint256` arithmetic; overflow reverts the transaction.
6. For each row, call the fixed token's `transferFrom(msg.sender, recipient, amount)`. The payer must already have sufficient allowance and balance. No approval transaction is issued by the contract, and funds are not routed through a Setlora custody balance.
7. If a call returns `false`, revert `TransferFailed(index)`. A token revert or incompatible return data also causes the typed call to revert; the contract does not wrap all such failures in `TransferFailed`.
8. Emit `InvoiceSettled` after each successful transfer. After all transfers, clear the lock and emit `BatchSettled`.

The contract does not enforce an exact allowance. The UI requests approval for the reviewed total when allowance is insufficient; an existing sufficient allowance can be used without another approval signature.

## Payer-scoped replay bitmap

For invoice number `n`, the word index is `n >> 8` and the bit is `1 << (n & 255)`. Up to 256 invoice flags share a word in `settledWords[payer][wordIndex]`.

- `isSettled(address payer, uint256 invoiceNumber)` reports the relevant bit.
- `bitmapOf(address payer, uint256 wordIndex)` exposes the full word.
- Different payers may reuse the same invoice number. There is no flag-reset mechanism.
- A flag records that a number was settled; it does not store or prove its recipient or amount. Verify transaction evidence and events for those details.

## Events

```solidity
event InvoiceSettled(
    address indexed payer,
    uint256 indexed invoiceNumber,
    address indexed recipient,
    uint256 amount
);
event BatchSettled(address indexed payer, uint256 count, uint256 total);
```

A successful batch emits one `InvoiceSettled` per row, in input order, and one final `BatchSettled`. Amounts and total are integer token base units. Recipients, invoice numbers and payment amounts are public.

## Atomicity and rollback

All validation, bitmap writes and transfers occur within one EVM transaction. A validation failure, arithmetic overflow, failed token transfer or uncaught revert rolls back new flags, earlier transfers, emitted logs and the lock change in that transaction. Previously committed settlements are unaffected. A reverted settlement does not undo an approval made in an earlier transaction; transaction fees may still be charged.

The lock blocks nested `settle` calls during token interactions. This is a concrete control, not proof against every token or runtime attack. Atomicity assumes the token adapter participates in EVM rollback correctly; it does not extend to native payouts or cross-chain execution.

## Recorded deployment and settlement evidence

| Field | Value |
| --- | --- |
| Network | Portaldot V3 Testnet |
| Chain ID | `420420777` |
| Contract | `0x2d17199920251f7eec8a555043c8387194ff5d1b` |
| Deployment transaction | `0x34ddf0af59d82b991fdb07a72679c8e1f52e0aa0f8e9aa15d260278fb1092b24` |
| Deployment block | `255194` |
| pUSD token | `0x00001E6100000000000000000000000000010000` |
| Token decimals | `6` |
| Payer | `0x9Ceaa6aBFb2bC1aC202f96496Cdc683d86Bc458a` |
| Settlement transaction | `0x0ea4730fc73f3842a80f3015ee682ffa2bc0c5312fccf272d9899ee3ec1e3c16` |

The batch checked on October 31, 2026 paid three recipients in one transaction: invoice **1001: 0.10 pUSD** (100,000 base units), **1002: 0.15 pUSD** (150,000), **1003: 0.20 pUSD** (200,000), total **0.45 pUSD** (450,000). Recorded verification covered the successful receipt, three invoice events, batch total and settled flags. Later recipient balance queries matched the amounts. This documents prior testnet evidence; it is not a new execution, explorer source-verification claim or exhaustive adapter verification.

## Local test scope

[SetloraBatch.t.sol](../contracts/test/SetloraBatch.t.sol) contains nine named tests:

- `testThreePaymentsAndBitmap`
- `testDuplicateNumbersInSameBatchRevertsEverything`
- `testReplayAcrossBatchesRevertsEverything`
- `testInsufficientFundsRollsBackAll`
- `testSecondTokenTransferFailureRollsBackAll`
- `testInvalidRecipientAndZeroAmountRejected`
- `testDifferentPayersMayReuseNumbers`
- `testSeparateBitmapWords`
- `testMaliciousTokenCallbackCannotReenter`

Run `forge test -vv` and `forge build` from `contracts/`. In this release documentation check, all nine tests passed and the build succeeded. The build emitted lint warnings about external calls in loops, reentrancy analysis, event ordering and reverts in loops; these remain review items. These are local tests using mock tokens, not an independent audit or exhaustive security verification. Further boundary, fuzz/property, malformed-return and runtime-specific tests are needed; see the [threat model](THREAT-MODEL.md).

## Trust boundaries

The wallet holder must verify recipients, amounts and invoice numbers. The contract cannot detect forged invoices, duplicate real obligations under new IDs, or payments through another payer or contract. It assumes bool-returning `transferFrom` means a standard full-amount transfer; fee-on-transfer, rebasing and other nonstandard token semantics are outside the supported assumptions.

The frontend verifies receipts, events, totals and flags. RPC outages leave results unknown; do not automatically resubmit. Native SS58 payouts, sponsored onboarding and cross-chain settlement are not implemented. Mainnet would require further design, security and runtime review; current testnet evidence does not authorize production use.
