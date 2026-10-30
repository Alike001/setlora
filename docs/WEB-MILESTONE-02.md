# Setlora milestone 02 — browser app

## Verified before this milestone
- Native ↔ EVM account funding path demonstrated on Portaldot V3
- Native wallet 497.985 tPOT after small test transfer
- MetaMask mapped address confirmed via RPC (1.9 tPOTv3)
- ERC-20 precompile `decimals()` = 6; payer pUSD balance = 0
- SetloraBatch local Foundry tests: 9 passed
- via-IR bytecode: 1,557 bytes
- Read-only deployment estimate: 4,687,681,298,347,721 gas
- Quoted gas price: 26,565 wei
- Indicative deployment budget: ~124.5283 tPOT (not a receipt)

## Milestone 02 scope
- Functional local web editor and wallet integration
- Onchain balances, allowance, invoice flags and receipt verification when configured
- Explicit approval and settlement with fail-closed status
- Tests for data validation and event reconciliation

## Outstanding acceptance checks
1. Independent contract security review, including asset-precompile and reentrancy assumptions
2. Fund mapped MetaMask account with a controlled deployment budget
3. Deploy verified bytecode on V3; record address, transaction hash, receipt, total cost and refundable deposit where visible
4. Obtain legitimate test pUSD from issuer or approved test setup
5. Confirm `approve`, `settle` and per-invoice events on actual V3 with independent recipients
6. Verify reload/pending/unknown/rejected/replay states on live network
7. Deploy UI and run cross-browser/mobile/accessibility smoke tests

Do not claim any of 1–7 passed merely because the web source builds or local unit tests pass.
