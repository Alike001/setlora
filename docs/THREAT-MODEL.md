# Setlora threat model

Scope: the current browser application and fixed-token `SetloraBatch` on Portaldot V3 Testnet. Check-in is submitted and under review. Testnet deployment and a three-recipient settlement have recorded evidence in the [settlement specification](SETTLEMENT-SPEC.md). No independent security audit or mainnet support is claimed.

The assets at risk are payer funds and allowances, payment intent, recipient correctness, invoice replay state and receipt integrity. Trust boundaries include the browser/frontend, injected wallet, EVM RPC, native RPC, token adapter and chain runtime. Local browser storage is not trusted proof of payment.

## Actual controls and remaining risks

| Threat | Implemented control | Remaining risk / user action |
| --- | --- | --- |
| Duplicate invoice attacks | Nonzero IDs, a 10-invoice cap and payer-scoped bitmap; all IDs checked and marked before token calls. Repeated IDs within or across batches revert. | A different ID, payer or contract can pay the same real obligation. There is no issuer authentication or organizational approval workflow. Verify invoice identity before signing. |
| Reentrancy | `entered` guard blocks nested `settle`; all invoice flags are marked before external calls. One local callback test exercises rejection. | This is bounded evidence, not an audit. Adapter/runtime behavior and other adversarial call patterns need further review. |
| Partial settlement | False-returning or reverting `transferFrom` causes EVM rollback of the batch, including new flags, earlier transfers and logs. | Assumes full token transfers and correct runtime rollback. A prior approval and transaction fees are outside settlement rollback. |
| Incorrect recipients or amounts | Input validation, review table, recipient simulations, full-batch estimation, explicit wallet signature and post-settlement event matching. | A valid address can belong to the wrong person. Simulations do not establish ownership or guarantee later success. The contract rejects zero addresses, not mistaken nonzero ones. No built-in reversal exists. |
| Wallet compromise | Payer signs through their own wallet; active account/network are rechecked before financial requests. Approval and settlement are separate requests. | Stolen keys or a compromised wallet can authorize valid harmful transactions. Replay prevention cannot protect a compromised payer. Protect signing credentials and review allowances. |
| Malicious frontend | Wallet confirmation is required; the honest frontend checks contract presence, token identity, decimals and payment evidence. | A compromised frontend can change transaction intent or falsify its display. Frontend checks cannot protect against that frontend itself being malicious. Check spender, destination and amounts through trusted wallet/chain views. |
| RPC outage or dishonest data | Failed checks block progression; unavailable receipts/flags leave verification unknown. Workspace verification can consult configured RPC and the connected wallet provider. Native checker reports unavailable reads. | Providers may be unavailable, stale or correlated. Current reads are not independent consensus verification. A timeout is not evidence of failure or an absent native account. |
| Unknown transaction and unsafe retry | Unresolved/mismatched settlement state blocks another settlement in the workspace. Recovery accepts transaction hashes and checks payer, contract, network and calldata; receipt verification checks events, total, canonical-block evidence and flags. No automatic resend. | Missing hash/calldata/receipt or lost browser state can prevent recovery. Check wallet activity and chain evidence before any retry. A settled bit alone does not prove which recipient or amount was paid. |
| Unsupported token behavior | Immutable token; frontend checks token identity and six decimals. Typed `transferFrom` requires bool-compatible return data and rejects `false`. | The contract assumes `true` means full delivery and correct rollback. It does not measure balance deltas. Fee-on-transfer, rebasing, missing/malformed returns and a dishonest token are not supported. Recorded pUSD success does not establish all adapter edge cases. |
| Public transaction privacy | No free-text invoice descriptions are stored by the contract. | Payer, recipients, invoice numbers, amounts, calldata and events are public and correlatable. Avoid publishing sensitive invoice details; JSON receipts can expose payment relationships. |
| Browser-local history loss or tampering | Draft/history keys are scoped to account/network (history also to contract); saved receipt evidence can be rechecked on-chain. | Storage can be edited, cleared or lost and does not automatically synchronize across devices. Clearing state can remove local retry safeguards. Preserve transaction hashes and reverify exports; a saved entry is not independent evidence. |
| Gas/storage exhaustion | Maximum 10 rows and compact invoice bitmap bound work per call. Full-batch estimation occurs before settlement. | New bitmap words still consume storage. Gas, deposits, fees and inclusion conditions can change; estimation is not a cost guarantee. |

## Unknown transaction recovery

1. Preserve any known transaction hash and the intended payer, contract, invoice IDs, recipients and amounts. Do not interpret a timeout as a failed transaction.
2. Check wallet activity for a broadcast hash. Use the payment workspace's payer-scoped recovery, or the public wallet-free verifier for a recorded hash.
3. Require a successful matching receipt, invoice events, batch total and settled flags before declaring payment confirmed. Investigate mismatches; do not treat a flag alone as full receipt evidence.
4. If evidence remains unavailable, keep the result unknown. Do not blindly resend, including from a different browser or with new invoice IDs.

Approval uncertainty should also be investigated through wallet activity and allowance reads. Approval alone is not settlement, and a settlement failure does not automatically revoke a pre-existing allowance.

## Additional work required before mainnet

- Independent security review of contract, frontend, wallet flows, dependencies and chain/token adapter assumptions; resolve findings before production consideration.
- Add fuzz/property and boundary tests for batch size, unequal arrays, arithmetic, bitmap boundaries and invalid constructor input. The current suite has nine named tests, not exhaustive coverage.
- Expand adversarial token tests: malformed/missing returns, token reverts, dishonest success, callbacks and rollback behavior on the actual runtime.
- Broaden browser-wallet tests for rejection, account/network changes, replacement/dropped transactions, missing hashes, reload/storage loss and compromised or unavailable providers.
- Validate reorg/finality handling, provider disagreement, event/calldata inconsistencies, runtime storage deposits and actual costs under realistic failure conditions.
- Review frontend delivery integrity, dependency supply chain, allowance exposure, privacy, recovery guidance and incident response. Define and verify any proposed mainnet configuration separately.

Native SS58 payouts, sponsored onboarding and cross-chain settlement are not implemented. The native checker is read-only; its responses are not payout authorization or proof that an EVM transfer will succeed. These future features would need their own threat analysis.
