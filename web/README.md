# Setlora web (milestone 03)

A two-page Portaldot V3 testnet experience: public landing page (`/`) and wallet-connected workspace (`/app.html`).

## Run locally

```sh
cd web
npm install
npm test
npm run build
npm run dev
```

Open the Vite URL to see the landing page. Use **Open app** to enter the workspace. To load the workspace directly use `http://127.0.0.1:5173/app.html`.

## What works

- Public landing page with honest testnet status, how-it-works, transparency and audience explanation
- Invoice creation (up to 10), CSV import and downloadable CSV header template
- Manual exact six-decimal pUSD validation, unique invoice numbers, address validation
- MetaMask connect on explicit user action, network switch on explicit action
- Contract address, bytecode, token identity and decimals checks before approvals
- Per-payer invoice settlement checks, exact approval, batch call, receipt/event/flag verification
- Last pending transaction snapshot in browser localStorage and conservative unknown/mismatch retry blocking
- JSON receipt export only after verified settlement

## Live integration constraints

By design, approval and settlement controls are disabled until `VITE_SETLORA_CONTRACT_ADDRESS` is configured to a *real verified deployment*. The app does not deploy Setlora or mint pUSD. A working interface with no configured contract is **not** a completed transfer. Contract address must match V3 chain and point to the expected token. No transaction is sent on a page load.

This is a *testnet* application, not audited or ready for mainnet funds. Do not put private keys in environment files or browser UI.

## Environment

Only after deployment and independent verification:

```sh
cp .env.example .env.local
# Set VITE_SETLORA_CONTRACT_ADDRESS to a real deployed contract address
# Restart Vite
```

Note that a token approval is **not** a payment. Users explicitly sign the settlement transaction separately. A wallet/RPC failure before a hash is returned is inherently ambiguous. Confirm the wallet history and onchain nonce/settlement flags before retrying. The receipt export is a local evidence summary, not an independent attestation.

## Build and hosting

`npm run build` emits two static pages: `dist/index.html` and `dist/app.html` plus assets. Deploy the `dist` folder to static hosting (for example Vercel's Vite output, Netlify, or a static web server). Both routes must remain accessible.
