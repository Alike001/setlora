# Setlora release status

The check-in is **submitted and under review**. Setlora is experimental Portaldot V3 testnet software, with a deployed contract and recorded end-to-end pUSD settlement. Final-release preparation remains in progress.

## Implemented functionality

- Self-custodial EVM payments for 1–10 invoices with CSV import and six-decimal amount validation.
- Fixed-token atomic settlement, payer-scoped bitmap replay prevention and reentrancy protection.
- Wallet/network, contract/token, balance and invoice checks; recipient simulations and full-batch estimation.
- Explicit token approval when allowance is insufficient and a separate settlement signature.
- Receipt/event/total/flag verification, JSON export, public wallet-free verification and payer-scoped transaction-hash recovery.
- Responsive browser application, account switching, saved drafts and browser-local payment history.
- Read-only native account checker and MDX guides; combined build targets `/docs/` alongside the existing app. Public documentation deployment is not verified by this review.

## Verified testnet evidence

| Field | Recorded value |
| --- | --- |
| Network / chain ID | Portaldot V3 Testnet / `420420777` |
| Contract | `0x2d17199920251f7eec8a555043c8387194ff5d1b` |
| Deployment transaction | `0x34ddf0af59d82b991fdb07a72679c8e1f52e0aa0f8e9aa15d260278fb1092b24` |
| Deployment block | `255194` |
| pUSD / decimals | `0x00001E6100000000000000000000000000010000` / `6` |
| Settlement transaction | `0x0ea4730fc73f3842a80f3015ee682ffa2bc0c5312fccf272d9899ee3ec1e3c16` |

The batch checked on October 31, 2026 settled invoice **1001: 0.10 pUSD**, **1002: 0.15 pUSD**, and **1003: 0.20 pUSD**: **0.45 pUSD, one transaction, three recipients**. Recorded checks covered a successful receipt, three invoice events, batch total and settled flags; later recipient balance queries matched those amounts. These are prior testnet observations, not fresh transfers performed during this documentation review.

## Remaining final-release work

- Final live-site walkthrough and demonstration, including verifying the intended public `/docs/` route after publication.
- Additional wallet, recipient and pending/unknown recovery edge cases; live browser/mobile/accessibility checks.
- Final submission video and pitch materials.
- Additional security review and testing described in the [threat model](THREAT-MODEL.md). The nine named Foundry tests do not constitute an audit or exhaustive security verification.

Contract deployment and pUSD payment integration are not pending work.

## Features not implemented and limitations

- Native SS58 payouts, sponsored onboarding and cross-chain settlement are not implemented. Native account checking is read-only.
- No mainnet support or independent security audit.
- No invoice-issuer authentication or organizational approval workflow.
- History and drafts do not synchronize automatically across devices; browser storage can be lost or modified. Chain rechecks are required for saved evidence.
- RPC outages can prevent verification. Unknown transactions must be investigated before retrying.
- Recipient simulations cannot guarantee future execution; token behavior and public-chain privacy assumptions remain material risks.

See [README](../README.md), [settlement specification](SETTLEMENT-SPEC.md) and [threat model](THREAT-MODEL.md). Milestone 02 and 03 reports are historical snapshots, not current release checklists.
