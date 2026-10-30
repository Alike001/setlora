# Setlora web — milestone 02

A real wallet-connected browser flow designed for **Portaldot V3 testnet** and the existing `SetloraBatch.sol` contract ABI.

## Run locally

```bash
cd ~/Desktop/portaldot/setlora/web
npm install
npm test
npm run dev
```

Open `http://127.0.0.1:5173/` (check the exact port in the terminal).

**Preview mode is intentional:** without a verified deployed Setlora contract address, the invoice editor works but settlement/approval are disabled.

## Activate contract integration (only after verifying deployment)

Copy `.env.example` to `.env.local`, then fill `VITE_SETLORA_CONTRACT_ADDRESS` with the verified contract address. This address is public; never put a private key, mnemonic, or signer secret in the `.env` file. Restart `npm run dev` after changes.

The app checks `eth_getCode` for deployed bytecode and `token()` for the pUSD precompile. It also requires `decimals() == 6`. It asks for wallet confirmation before *each* `approve()` and `settle()` transaction.

## App capabilities

- Invoice numbers, recipients, exact 6-decimal amounts, optional local notes
- CSV import (headers `invoice,recipient,amount,note`)
- Validate at most 10 invoice rows, positive amounts, unique invoice IDs, EVM address validation
- Connect MetaMask and switch/add Portaldot V3 on explicit click
- Verify contract address and configured token, wallet pUSD balance, allowance and `isSettled` flags
- Approval for the exact batch amount (not unlimited)
- Batch settlement with explicit second wallet authorization
- Save last hash + expected invoice evidence in browser localStorage (never secrets)
- Confirm only with receipt status, matching contract events and on-chain invoice settlement flags
- Unknown/failed/mismatch states rather than claiming completion from broadcast

## Limits and warnings

- **Not yet tested on live Portaldot with a deployed Setlora contract or real pUSD payment.**
- This is testnet software; the Solidity contract has nine passing local tests, not a security audit.
- Each payer's invoice numbers are unique only within this specific Setlora deployment. No invoice authenticity or supplier identity attestation is implemented.
- No server-side persistence, multi-user organization approvals or complete accounting import/export yet.
- If a wallet or RPC fails before a transaction hash is returned, check the wallet's activity and on-chain records manually before retrying. The app cannot conclusively establish a never-returned hash.
- The first review relies on pending chain state. Always approve only after checking full recipient addresses and amounts in your wallet.
- The displayed pUSD comes from the documented third-party test token at the precompile address; funds are not supplied by Setlora.
- Browser localStorage can contain payment metadata; avoid entering sensitive personal details and do not use on a shared computer.
- Never deploy to mainnet or use real money on this test-only version.

## Quality checks

`npm test` runs Node's standard-library tests for exact token math, canonical invoice numbers, CSV parsing, and event reconciliation. `npm run build` compiles the Vite app after installing dependencies.
