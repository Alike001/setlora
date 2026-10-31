# Setlora web

Static Vite application for **Portaldot V3 Testnet**. The landing page is `/`; the EVM wallet-connected payment workspace is `/app.html`.

## Local setup

```bash
cd web
npm ci
npm test
npm run build
```

Set the public V3 testnet contract address in `web/.env.local` (the file is Git-ignored):

```dotenv
VITE_SETLORA_CONTRACT_ADDRESS=0x2d17199920251f7eec8a555043c8387194ff5d1b
```

Then start the dev server:

```bash
npm run dev -- --port 5173 --strictPort
```

Open `http://127.0.0.1:5173/` for the landing page or `/app.html` for the workspace. You need a compatible EVM wallet and Portaldot V3 testnet tokens for payment actions. **Do not use real money or store keys in `.env.local`.**

## Current features

- Up to 10 invoice recipients, exact six-decimal pUSD amounts, CSV import and duplicate-invoice prevention per payer/contract.
- EVM wallet discovery, change-wallet and account switching; session restoration does not silently request wallet permissions.
- Contract code, chain, token identity, decimals, balances, allowance and existing invoice checks before payment.
- Read-only recipient-transfer simulation; full-batch preflight, exact approval, explicit batch settlement.
- Transaction receipt/event/invoice-flag verification before marking a settlement confirmed or exporting a JSON receipt.
- Browser-local account/contract/chain-scoped drafts and verified payment history. Historical hashes can be checked on-chain from other browsers when supplied manually.

**Important:** This is a testnet-only, unaudited EVM workflow. Native SS58 addresses are not accepted by the current payment contract. Browser history does not automatically sync between devices; never interpret a local record as fresh chain proof without rechecking it. Recipient simulations are useful warnings, not guarantees of final execution.

## Build and hosting

`npm run build` creates `dist/index.html`, `dist/app.html` and their bundled assets. Configure the `VITE_SETLORA_CONTRACT_ADDRESS` environment variable **at build time** in your hosting provider and deploy the `dist` folder. Keep both URLs accessible. A blank contract address intentionally disables payment actions.

For the working testnet example, deployed addresses, replay semantics, evidence and native-account roadmap, see the [root README](../README.md).
