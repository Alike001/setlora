# Threat model — Setlora payment MVP

| Risk | v0.1 handling | Remaining gap |
|---|---|---|
| Duplicate invoice within/across batches | Persistent payer-scoped bitmap; flags are marked before token calls | Cannot stop same real invoice paid under a different ID or through other apps |
| Partial batch on token failure | EVM revert rolls back all state and token transfers | Depends on standard token/EVM semantics; must test live adapter |
| Token callback/reentrancy | Simple reentrancy lock; full validation and marking before external token interactions | One callback test is not a full audit |
| Fake invoice | User signs exact destination and amount | No issuer authentication or organizational approval workflow yet |
| Front-end retry after RPC failure | Intended recovery through tx-hash receipt and bitmap query | Web client still needs to be implemented/tested |
| Gas/storage exhaustion | 10-item cap; bitmap for 256 invoice numbers/slot | Live V3 amounts and deposit refunds unknown |
| Privacy of invoices | No free-text invoice metadata onchain | Addresses/amounts and public events remain visible |
| Unsupported token behavior | Fixed token and strict bool-returning `transferFrom` | Live native-asset precompile integration unproven; rejects nonstandard tokens |
| App compromise | Onchain tx must be signed from wallet | Malicious frontend can still trick users; review screen and simulation essential |

## Required tests not yet included

Fuzz/property tests for random invoice arrays, malformed token-return data, event decoding, indexer chain reorgs, estimate/actual storage deposits, front-end wallet rejection and RPC failover.
