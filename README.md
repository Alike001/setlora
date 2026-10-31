# Setlora

## How to test — Judges

**Live app:** https://setlora.pages.dev/
**Wallet-free verification:** https://setlora.pages.dev/proof
**Payment workspace:** https://setlora.pages.dev/app
**Native account checker:** https://setlora.pages.dev/native

### No wallet or test tokens needed
1. Open the landing page and explore the workflow.
2. Open the native account checker.
3. Select Invoice #1001 or #1003, then click Check account.
4. Inspect the reported pUSD asset-account state and balance.
5. If the native RPC times out, the result is unavailable, not proof of an absent account.

### Verified testnet settlement
A real three-recipient batch was verified on Portaldot V3:
- Invoice #1001: 0.10 pUSD
- Invoice #1002: 0.15 pUSD
- Invoice #1003: 0.20 pUSD
- Total: 0.45 pUSD
- Transaction: `0x0ea4730fc73f3842a80f3015ee682ffa2bc0c5312fccf272d9899ee3ec1e3c16`

See the evidence section below for the payer, contract, and verification details. The current in-app recovery interface is payer-scoped; a wallet-free public receipt verifier is planned.

### Test with your own EVM wallet
1. Connect a supported EVM browser wallet to Portaldot V3 Testnet (chain ID 420420777).
2. Enter a new invoice number, an EVM recipient address, and a pUSD amount.
3. Click Review batch. Reviewing does not sign or transfer funds.
4. For an actual settlement, the payer needs test pUSD and gas token. The wallet must explicitly approve and sign.
5. Do not send real funds. Never share a private key or seed phrase.

Test-token distribution is coordinated through Portaldot's official channels. No unrestricted public faucet is verified here.

### Run automated tests locally
Requires Node.js 22+ and npm.

```sh
cd web
npm ci
npm test
npm run build
```

Solidity tests use Foundry from `contracts/` with `forge test -vv`.

**Limits:** This is an unaudited testnet app. Native wallet payouts, sponsored account activation, and cross-chain settlement are not implemented.

---

**Invoice-aware batch payments with verifiable receipts on Portaldot V3 Testnet.**

Setlora helps teams pay several contributors in one transaction while keeping invoice numbers attached to the results. Rather than juggling individual transfers, spreadsheets and screenshots, a payer prepares a batch, reviews the recipients and amounts, approves the exact test-token amount, and signs one atomic settlement. Setlora then checks the on-chain receipt, events and invoice flags before reporting completion.

Built for **Portaldot Hacker House 2026 — Ecosystem DApps**.

> **Testnet only. Not audited. No real-money use.** Setlora is an experimental application. Its current live settlement route uses EVM-compatible wallets and test pUSD. Native-address settlement, sponsored onboarding, and cross-chain settlement are not implemented.

## What works today

- Public landing page and wallet-connected payment workspace with EVM wallet discovery and account switching.
- Up to **10 invoice-linked recipients** per batch; CSV import, precise six-decimal pUSD amounts, and duplicate invoice-number validation.
- Wallet and network verification before signing, including contract bytecode and token identity checks.
- Read-only recipient transfer simulations and full-batch estimation; failure blocks approval rather than pretending a transfer will succeed.
- **Exact token approval followed by a separate, explicit settlement signature**. The fixed-token `SetloraBatch` contract executes all transfers atomically or reverts them all.
- Contract-enforced replay prevention for invoice numbers **per payer within this contract** (not a universal invoice registry).
- Conservative handling of pending/unknown transactions. Verified JSON receipts require matching transaction evidence, expected events, total and on-chain invoice flags.
- Account- and network-scoped saved drafts and browser-local verified payment history. Past payments can be rechecked from the chain using their transaction hash.

Payment-history entries and drafts are browser-local: they **do not automatically sync across devices**, and a saved entry is not independent proof without fresh on-chain verification. The current form accepts **EVM `0x...` recipients only**.

## Verified Portaldot V3 testnet example

An end-to-end testnet batch was executed and checked on **October 31, 2026**:

| Invoice | Amount | Result |
| --- | ---: | --- |
| `1001` | 0.10 pUSD | Settled |
| `1002` | 0.15 pUSD | Settled |
| `1003` | 0.20 pUSD | Settled |
| **Total** | **0.45 pUSD** | **3 recipients** |

- **Network:** Portaldot V3 Testnet, EVM chain ID `420420777`
- **Settlement contract:** [`0x2d17199920251f7eec8a555043c8387194ff5d1b`](https://github.com/Alike001/setlora/blob/main/contracts/src/SetloraBatch.sol) (linked to source, not an explorer verification)
- **Test token:** `0x00001E6100000000000000000000000000010000` (pUSD, 6 decimals; native asset ID 7777 in our testnet integration)
- **Payer:** `0x9Ceaa6aBFb2bC1aC202f96496Cdc683d86Bc458a`
- **Settlement transaction:** `0x0ea4730fc73f3842a80f3015ee682ffa2bc0c5312fccf272d9899ee3ec1e3c16`

Tests in the workspace checked the successful transaction receipt, three `InvoiceSettled` events, the `BatchSettled` total, and `isSettled` flags. Subsequent read-only queries showed 0.10, 0.15 and 0.20 pUSD in the corresponding recipient accounts. This is testnet evidence, **not** an audit or proof of mainnet readiness.

## Run locally

Requirements: **Node.js 22+** and npm; **Foundry** for contract tests. To make testnet transactions, use an EVM wallet configured for Portaldot V3 Testnet and obtain test tokens for the payer. **Never put private keys or seed phrases in the repository.**

```bash
# Frontend
cd web
npm ci
npm test
npm run build
```

Create `web/.env.local` with your public contract address (a contract address is not a secret):

```dotenv
VITE_SETLORA_CONTRACT_ADDRESS=0x2d17199920251f7eec8a555043c8387194ff5d1b
```

Then run `npm run dev -- --port 5173 --strictPort` from `web/` and open `http://127.0.0.1:5173/` (or `/app.html` for the workspace). The app runs in read-only mode until a deployed contract is configured. No transaction is signed on page load.

```bash
# Solidity contract tests (from repository root)
cd contracts
forge test -vv
forge build
```

The frontend build emits `web/dist/index.html` and `web/dist/app.html`. On static hosting, **set `VITE_SETLORA_CONTRACT_ADDRESS` during the build**, publish `web/dist`, and verify both pages work. The public site must not contain private signing keys.

## Safety boundaries

- **No custody:** users approve the token and sign settlement from their own wallet. An allowance is not itself a payment.
- **Uncertain means uncertain:** an RPC timeout or missing receipt does not justify resending a transaction. Check wallet activity, chain evidence and invoice flags before retrying.
- **Atomicity is confined to the one EVM settlement transaction.** It does not imply atomic cross-chain or native/EVM execution.
- **Recipient checks are preflight simulations, not guarantees.** Balances, network conditions and asset-account state may change before settlement.
- **Not audited:** do not use with real assets. No mainnet production support is claimed.

## Native Portaldot account roadmap

Today Setlora uses EVM `0x...` addresses. Our next research track is native `AccountId32` / SS58 recipient support, native wallet connectivity, account-readiness/activation guidance and only then native/EVM interoperability. **Do not paste a native `5...` address into the current EVM recipient field.** The mapping and transaction semantics must be verified specifically for Portaldot V3; we will not assume another chain's conversion rules apply.

See [Native accounts and onboarding research plan](docs/NATIVE-ACCOUNTS-ROADMAP.md) for the concrete acceptance checks.

## Repository

- `contracts/src/SetloraBatch.sol` — fixed-token atomic settlement contract
- `contracts/test/SetloraBatch.t.sol` — unit and rollback/replay tests
- `web/` — landing page, application, tests, and production build
- `docs/` — design decisions and milestone notes (some older documents describe historical pre-deployment states)

This is original hackathon implementation work; feedback, reproducible bugs and PRs are welcome. Please avoid publishing private keys, wallet seed phrases or personal payment records in issues.
