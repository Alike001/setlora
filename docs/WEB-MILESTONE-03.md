# Web milestone 03 — Product UX and safer payment flow

> **Historical milestone snapshot — not current release status.** This report preserves the implementation state and outstanding checks at that milestone. Its old deployment, payment-integration and other pending tasks are not the current release checklist. Setlora now has recorded Portaldot V3 deployment and three-recipient settlement evidence; the check-in is submitted and under review. See [current status](STATUS.md), [settlement specification](SETTLEMENT-SPEC.md) and [threat model](THREAT-MODEL.md). Historical estimates, where present, are not actual deployment costs.

## User experience

- Public landing page (`/`) for people who do not yet understand wallet payments
- Independent payment workspace (`/app.html`)
- Clear Portaldot testnet preview status (no false production or deployment claims)
- Invoice table, CSV header template, live summary, understandable wallet approval steps
- Receipt/export area distinguishes verified evidence from broadcast/unknown states
- Responsive layouts for mobile and desktop; semantic headings, accessible labels, aria-live messages

## Payments and safety

- Continued reuse of the milestone 02 contract ABI and read-only verification flow
- No private keys or background transaction activity
- Unknown/mismatched last settlement blocks another settlement until investigated
- JSON export enabled only after confirmed receipt + event + settlement checks
- Wallet account and network changes invalidate current reviewed batch

## Limits

- Deployed V3 contract, test pUSD, settlement receipt, explorer evidence and independent audit are outstanding
- This remains a testnet preview. A screenshot of the landing page is not proof of financial settlement.
- Existing milestone 02 pending-transaction records are recovered from the earlier localStorage key where possible; no replacement transaction is ever auto-sent
