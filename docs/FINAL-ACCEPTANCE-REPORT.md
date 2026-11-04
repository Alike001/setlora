# Setlora final acceptance report

## Recommendation

**CONDITIONAL GO for a bounded Portaldot V3 testnet hackathon demonstration.** Week 2 check-in is submitted; this is preparation for the final release, not a new check-in. No mainnet or real-money readiness is claimed.

Conditions before calling the final public release accepted:

1. Resolve or explicitly accept the fast network-switch connection defect F05, and complete a real browser-wallet smoke matrix. Current evidence for wallet interaction is synthetic, not a MetaMask/Rabby extension certification.
2. Publish only through a separately authorized release step, then recheck the four local fixes on the live site. Nothing was pushed or deployed during this audit; production is not claimed to contain these fixes.
3. Retain the testnet-only limitations and unknown-transaction recovery guidance. Further security work remains necessary before any mainnet consideration.

No unsafe broadcast or false chain confirmation was observed in the exercised scenarios. That is bounded evidence, not an independent security audit or exhaustive verification. The full-functionality objective remains conditional because of F05 and the explicitly untested scenarios below.

## Scope and evidence boundaries

- Audit date: **November 4, 2026**.
- Starting branch/HEAD: `main`, `547c59cb5130cabb5d6705d7ca818b9580ac6a30`.
- Acceptance criteria: the Phase 3 request; implementation references: [current status](STATUS.md), [settlement specification](SETTLEMENT-SPEC.md), [threat model](THREAT-MODEL.md), application source and existing frontend/Foundry tests.
- Local validation runtime: **Node.js 22.23.4**, Foundry 1.8.5. Documentation requires a supported Node patch; an earlier Phase 2 run established that Node 22.23.3 is insufficient.
- Browser evidence: Chromium through Playwright, the configured Vite source app at port 5174, the combined production output at port 4175, and `https://setlora.pages.dev/`.
- No private keys, seed phrases or wallet-backup contents were accessed. Existing untracked files, receipts, scripts and historical documents were preserved.
- No token approval, signature, new blockchain transaction, replacement payment, push or deployment occurred. Synthetic approval/settlement functions in an isolated browser context exercised UI state only. Other wallet mocks rejected signing/sending methods; real chain access was read-only.

Evidence labels used below: **unit** means a local automated helper/contract test; **browser mock** means application interaction against synthetic providers or API boundaries; **live read** means fresh public RPC/site evidence. Passing a mock does not establish production-wallet behavior.

## Confirmed defects and disposition

| ID | Defect and reproduction | Severity / disposition | Fix and regression evidence |
| --- | --- | --- | --- |
| F01 | CSV amount `0".1"` was silently parsed as `0.1` instead of rejected. Text after a closing quote was also accepted. | Medium; **fixed locally** after explicit user approval of the payment-input validation change. | Parser enforces quote placement; tests reject embedded quotes and trailing text while preserving escaped quotes, multiline notes and exact amounts. Browser regression confirms rejection preserves current entries. |
| F02 | `invoice,recipient,recipient,amount` silently kept the second recipient column, replacing the first. Normalized duplicate headers were also ambiguous. | Medium; **fixed locally** under the same explicit approval. | Reject duplicate normalized column headers before constructing rows. Unit and browser tests cover overwrite prevention and unchanged existing entries on rejection. |
| F03 | Disconnected user enters a valid invoice and clicks Review: message asks for a wallet but the intended wallet picker never opens because the operation is still busy. | Low; **fixed locally**. | Release the nonfinancial busy state before opening the picker. Browser regression checks the dialog, missing-provider guidance and disabled payment actions. |
| F04 | CSV import was a label around a hidden input, so keyboard Tab skipped the import action. | Low; **fixed locally**. | Use a native button to open the existing file input; disable it while busy. Browser regression checks reverse Tab from Add recipient, Enter opening the chooser and successful CSV import. No CSS redesign or overrides added. |
| F05 | With an immediate synthetic network switch, `connect()` reports wrong network even though raw `eth_chainId` already returns V3. A subsequent connection succeeds. | Medium; **open, fails closed**. Real-extension impact remains unverified. | Reproduced against the actual `chain.js` function. Proposed fix and required tests are below. No wallet/network implementation change made in this pass. |

The source changes leave token approval, settlement, receipt verification, wallet discovery/session helpers, token configuration and Solidity contracts unchanged. Changes in `main.js` are limited to picker display and CSV button wiring/busy state.

### F05 proposed wallet-flow fix, not implemented

Reproduction with a fresh synthetic provider:

1. `eth_requestAccounts` returns a public fixture account; initial `eth_chainId` returns `0x1`.
2. `wallet_switchEthereumChain` immediately updates the provider to `0x190f1ca9`.
3. The next raw `eth_chainId` returns V3, but `connect()` throws `Wallet is on the wrong network. Switch to Portaldot V3.`
4. Connecting again with the provider already on V3 works.

Provider network caching is a possible explanation; this audit did not establish the internal cause. Payment remains disabled on the rejected connection, so this reproduction does not authorize a wrong-network transaction.

Proposed change: validate a fresh raw chain response after switch/add-network, then establish or refresh the browser-provider/signer view against that chain before accepting the session. Preserve account/network rechecks immediately before financial requests. Review this wallet-flow change separately before implementing it.

Affected tests must cover immediate and delayed switch success, user rejection, unknown-chain/add-network behavior, a provider that remains on the wrong chain, account changes during connection, and stale authorization invalidation. Reproduce with real supported extensions before closing F05. Current workaround for the demo is to select V3 in the wallet first and reconnect.

## Acceptance coverage

### Payment creation and review

| Acceptance path | Result | Evidence and limits |
| --- | --- | --- |
| One, three and ten invoices | PASS | Browser mock: one invoice reviewed; three rows total 0.45 pUSD; ten one-base-unit invoices total 0.00001 pUSD. Ten-row cap disables Add. |
| Add/remove/edit recipients | PASS | Removing a row re-enables Add; adding creates an empty row; editing clears prior review and disables approval/settlement. Removing the final row retains one blank editor row by source behavior. |
| CSV valid import | PASS | Browser import and unit tests cover required columns, notes, commas, escaped quotes, BOM, CRLF and multiline quoted notes. |
| Malformed CSV | FAIL → FIXED locally | F01/F02 regressions pass. Missing headers, header-only files, unclosed quotes, wrong column counts and more than ten rows are rejected by existing tests/browser cases. Files over 150 KB are rejected by the handler; that size boundary was source-inspected, not exercised with a large browser upload. |
| Duplicate invoice IDs | PASS | `04201` and `4201` are treated as the same invoice and rejected. Unit tests also cover canonical duplicates. |
| Invalid invoice IDs | PASS | Browser: zero, negative, empty, alphabetic, fractional and exponent notation rejected with the row identified; invalid ID receives focus and `aria-invalid`. |
| Invalid recipients | PASS | Browser: malformed and zero EVM addresses rejected. Native SS58 is not a supported payment recipient format. |
| Amount precision | PASS | Browser rejects zero, negative, empty, nonnumeric and seven-decimal amounts; accepts 0.000001 exactly. Unit tests verify integer base units. |
| Draft refresh | PASS | Three-row draft and edited amount restored with the mock payer; silent restoration used `eth_accounts`/`eth_chainId`, not a permission request or signature. Unit tests cover account/chain/contract scoping and corrupt storage. |
| Draft clear confirmation | PASS | Cancel preserves all rows; confirm removes the saved draft and returns a blank row with an accurate status message. |
| Count and total | PASS | Counts, review rows and exact integer-derived totals match one/three/ten-row fixtures. |
| Balance and allowance | PASS | Browser mocks reflect 0.1 versus 10 pUSD and zero versus sufficient allowance. Independent live `balanceOf`/`allowance` calls matched workspace readings for the recorded payer: 1,550,000 base units (1.55 pUSD) and zero allowance at observation time. These are time-specific readings. |
| Insufficient balance/allowance | PASS | Insufficient balance disables both actions; insufficient allowance enables only approval. Existing sufficient allowance enables settlement without another approval request. |
| Recipient preflight | PASS with bounds | Actual client against mocked RPC accepts `true` and blocks `false`; readiness unit tests cover CannotCreate, minimum balance, insufficient funds and RPC failure. This does not guarantee future live execution. |
| Already-settled IDs | PASS | Mock chain flags block review with the invoice number identified; live flags 1001–1003 are true. Contract replay tests pass. |
| Stale review | PASS in exercised cases | Editing clears review. Delayed-review mocks emit account/network changes before balance lookup completes: payment remains disabled and old balances are not restored. Contract/network mismatches are also covered in recovery/export unit tests. |

### Wallets and transaction state

| Acceptance path | Result | Evidence and limits |
| --- | --- | --- |
| Connect/disconnect | PASS with mocks | Actual application/client accepts an injected mock and revokes mock account access on disconnect; controls and balances clear. No real extension was authorized. |
| MetaMask-style account selection | PASS with mocks | Explicit Switch account requests `wallet_requestPermissions`, then reads the selected account. Rejection and unsupported selection methods have unit coverage. |
| Switch wallet | PASS with mocks | EIP-6963 announcements for Mock MetaMask and Mock Rabby produced two choices; choosing Rabby used its own provider/account and left settlement disabled until review. |
| Refresh/reconnect | PASS with mocks | Authorized remembered wallet restores silently; unit tests reject stale account, chain, metadata or permissions. |
| Permission rejection | PASS with mocks | Connection rejection reports the provider error, leaves no usable session and does not enable settlement. |
| Wrong-network connection | **FAIL / F05 open** | Immediate switch can falsely fail despite the provider being on V3; second connection succeeds. Rejection/wrong-chain handling remains fail-closed. Real extension switch/add-network timing is untested. |
| Account/network changes during review | PASS with mocks | Normal and delayed-review event paths clear session/review and payment controls. |
| Missing provider | PASS | Picker explains that no EVM wallet was detected. F03 restores the intended path from disconnected review. |
| Separate approval and settlement | PASS at mock boundary | Synthetic approval updates allowance, creates no paid record and requires a separate settlement action. Actual wallet confirmation screens were intentionally not opened. |
| Double submission | PASS at mock boundary | Two rapid clicks call the synthetic settlement boundary once. Busy state disables inputs/actions; invoice replay is independently enforced in the contract tests. No universal protection across browsers/wallets is claimed. |
| Pending/signing transaction | PASS at mock boundary | Before the delayed settlement boundary returns, the original snapshot is persisted as `signing` and controls remain disabled. After broadcast evidence without confirmation the app uses `unknown`, not success. |
| RPC/ambiguous wallet timeout | PASS in exercised cases | A hashless ambiguous wallet error persists `unknown` and blocks another settlement. Missing receipts/RPC failures do not confirm. |
| Failed/mismatched transaction | PASS | Receipt-proof unit tests require matching identity/calldata before a failed receipt can clear uncertainty. UI boundary tests never enable verified export for failed or mismatched verification. |
| Refresh/recovery without replacement | PASS | Unknown state survives refresh; no replacement settlement call occurs. All exercised recovery APIs are read-only. |
| Stale payer/contract/network | PASS in covered layers | Session events and delayed reviews fail closed; recovery/export unit tests reject wrong payer, contract or chain. Contract address is build configuration, not an editable runtime selector. |

### Verification and history

| Acceptance path | Result | Evidence and limits |
| --- | --- | --- |
| Historical recovery | PASS, live read with mock payer identity | Local workspace recovered the recorded hash using real RPC calldata and evidence. A synthetic provider represented the public payer address; this was not a real wallet ownership demonstration. |
| Wallet-scoped history | PASS in covered cases | Live-read recovered batch appears as 0.45 pUSD / three recipients; unit tests reject cross-account/chain/contract, corrupt and duplicate records. Mock wallet switching did not expose another payer's record. |
| JSON export | PASS, live read | Downloaded and parsed `setlora-receipt-0ea4730f.json`; schema, chain, contract, payer, hash, invoice IDs, recipients, amounts and six decimals match. Export was enabled only after chain verification. |
| Recheck previous settlement | PASS, live read | Same-hash recovery becomes Recheck verified payment. History recheck confirms exact events/total/flags and enables its receipt export. |
| Public verifier without wallet | PASS, live read | Production verifier returns Verified for the recorded 0.45 pUSD batch. No wallet connection or signature needed. |
| Invalid/unrelated hashes | PASS, live read | `0x123` is rejected; deployment transaction is rejected as not a settlement to the configured contract; all-zero hash returns receipt unavailable and no result. |
| Wrong network/contract | PASS in covered layers | Mocked RPC chain `0x1` is rejected by the production public verifier. Actual unrelated deployment receipt is rejected; recovery/export unit tests reject wrong contract/network. |
| Missing events, wrong totals, flag mismatch | PASS, unit | Public-proof and receipt-proof suites reject missing/repeated/mismatched events and totals; missing flags remain unknown. No fabricated result is presented as live evidence. |
| RPC unavailable/delayed | PASS with bounds | Aborted production-verifier RPC shows an error and hides results; missing receipts remain unverified. Delayed wallet/review paths are mocked. There is no exhaustive long-hang/provider-failover test. |

### Native account checker

| Acceptance path | Result | Evidence and limits |
| --- | --- | --- |
| Valid SS58 and EVM | PASS, live read | Invoice 1001 SS58 preset and its EVM address resolve to the same native representation and 0.1 pUSD liquid holder. A generated public AccountId32 encoded as `5CT5jwBEAhveEjgiSCQbkaKcKcUyF3VJ8qNXM9rXsuQyn3Kd` is correctly labelled Native AccountId32. No signing material was involved. |
| Invalid address/checksum | PASS, live UI | Arbitrary invalid input and a mutated preset checksum are rejected; result panel remains hidden. |
| Existing/missing accounts | PASS, live read | Existing recipient has providers 1 / sufficients 0. EVM `0x0000000000000000000000000000000000000123` and the generated native account have no pUSD record and no provider/sufficient reference; UI recommends checks/setup without claiming a payout is ready. |
| Asset metadata | PASS, live read and unit | Asset 7777 reports pUSD, six decimals, minimum 0.01 pUSD, not sufficient. Unit tests cover unavailable asset, metadata mismatch, restrictions and below-minimum state. |
| Native RPC unavailable | PASS with interception | Closing the production page's mocked native WebSocket yields Native RPC timed out, no result, and no changes made. |

The native tool is read-only. These checks do not implement or validate native SS58 settlement, account sponsorship or native/EVM cross-chain payments.

### Responsive UI and accessibility

| Surface | 390px | 768px | 1440px |
| --- | --- | --- | --- |
| Landing page | PASS | PASS | PASS |
| Payment editor | PASS | PASS | PASS |
| Review screen | PASS | PASS | PASS |
| Payment history | PASS | PASS | PASS |
| Public verifier | PASS | PASS | PASS |
| Native checker | PASS | PASS | PASS |
| Documentation index | PASS | PASS | PASS |

These results mean route rendering, document-width and visible-input-label checks passed on both production and the local combined build. Document scroll width matched viewport width for each cell. Hash navigation between application panes is a same-document transition, not a separate HTTP route.

Additional populated review/history checks at all three widths passed: three review entries and the verified three-invoice history detail fit without page overflow; action buttons remain within the viewport and reachable by scrolling. The mobile workspace navigation intentionally scrolls horizontally inside its own container. Keyboard navigation showed visible focus indicators; F04 fixed the missing CSV keyboard action. Form validation feedback appears on the preparation screen, and F03 fixed picker navigation. A production 390px payment-editor screenshot was visually inspected.

This is not a full screen-reader, contrast, WCAG, real-device or cross-browser certification. Populated history was tested locally against live evidence, not by connecting a real wallet on production.

## Deployment and transaction evidence

Read-only RPC recheck at **2026-11-04 09:34:14 UTC**:

| Field | Observed value |
| --- | --- |
| Network / chain ID | Portaldot V3 Testnet / `420420777` |
| Contract | `0x2d17199920251f7eec8a555043c8387194ff5d1b` |
| Contract bytecode | Present; no new explorer source-verification claim |
| Token | `0x00001E6100000000000000000000000000010000`, pUSD, 6 decimals |
| Deployment transaction | `0x34ddf0af59d82b991fdb07a72679c8e1f52e0aa0f8e9aa15d260278fb1092b24` |
| Deployment status / block | Successful / `255194`; created the expected contract address |
| Settlement transaction | `0x0ea4730fc73f3842a80f3015ee682ffa2bc0c5312fccf272d9899ee3ec1e3c16` |
| Settlement status / block | Successful / `262291`; receipt block hash matches fetched chain block |
| Payer | `0x9Ceaa6aBFb2bC1aC202f96496Cdc683d86Bc458a` |
| Invoice 1001 | `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25`, 100,000 base units = 0.10 pUSD |
| Invoice 1002 | `0xF74aD341e10187073a0eef55356D136F1be5E3Cf`, 150,000 base units = 0.15 pUSD |
| Invoice 1003 | `0x7F1104F54b3957C2aCE8EEe6EE97489eec51B548`, 200,000 base units = 0.20 pUSD |
| Batch event | Count 3, total 450,000 base units = **0.45 pUSD**, one transaction, three recipients |
| Replay flags | `isSettled(payer, 1001/1002/1003)` all true |

The transaction object was available during this recheck. The live public verifier and local recovery separately confirmed the batch. These are fresh reads of an existing transaction, not a newly executed settlement.

## Quality gates and reproducibility

| Command / check | Result |
| --- | --- |
| `web`: `npm ci` | PASS; zero reported vulnerabilities |
| `web`: `npm test` | **79 passed, 0 failed** (75 existing + 4 CSV regression tests) |
| `web`: `npm run build` | PASS |
| `docs-site`: `npm ci` | PASS; zero reported vulnerabilities |
| `docs-site`: `npm run check:content` | PASS; 9 MDX pages, 5 internal documentation links |
| `docs-site`: `npm run build` | PASS |
| `web`: `npm run build:site` | PASS |
| `contracts`: `forge test -vv` | **9 passed, 0 failed** |
| `contracts`: `forge build` | PASS with lint warnings |
| [UI browser regression](../web/scripts/acceptance-ui.browser.js) | **7 assertions passed** |
| [Safety browser acceptance](../web/scripts/acceptance-safety.browser.js) | **21 assertions passed** |
| `git diff --check` | PASS |

The browser scripts are Playwright MCP function entry points, not Node unit tests. Start the configured Vite source app on port 5174, then invoke `browser_run_code_unsafe` with the script's absolute filename. They create/close isolated contexts and block chain writes; the safety script replaces `chain.js` at the financial boundary. They add no npm dependency and are not automatically run by the current GitHub Actions workflow. `npm test` remains the unit suite.

Combined output checks passed for all of:

```text
web/dist/index.html
web/dist/app.html
web/dist/proof.html
web/dist/native.html
web/dist/docs/index.html
web/dist/docs/how-to-test/index.html
web/dist/docs/send-payments/index.html
web/dist/docs/verify-payment/index.html
web/dist/docs/check-recipient/index.html
```

The live `/`, `/app`, `/proof`, `/native`, `/docs/` and `/docs/how-to-test/` returned HTTP 200 with the correct page titles/content. **Public documentation deployment is now verified by this Phase 3 observation.** This supersedes the earlier documentation-review uncertainty; it does not prove that the new local fixes have been deployed.

Warnings reviewed:

- npm deprecations for `node-domexception` and older `@substrate/connect`: nonfatal dependency maintenance warnings; no dependency updates attempted.
- Rollup removes a misplaced dependency `PURE` annotation; native RPC bundle exceeds the 500 kB chunk advisory. Builds succeed; performance follow-up remains.
- Astro/Starlight warns about empty optional `i18n` content and missing docs `404` entry; the build produces a 404 output. Required documentation pages and content checks pass; optional-content/configuration cleanup remains.
- Foundry reports external calls in loops, reentrancy analysis, event ordering and reverts in loops. These are nonfatal but require security review, not dismissal as an audit pass. The source sets its guard before calls; the callback unit test passes. Nine named tests are not exhaustive security verification.

Command logs were saved during this session under `/tmp/setlora-final-acceptance-d76og41i/`; raw public-chain read evidence is `/tmp/setlora-acceptance-chain.json`. Playwright generated local `.playwright-mcp/` artifacts. These session artifacts remain untracked and are not portable repository evidence; committed scripts and the observations above provide the reproducible record.

Exploratory failures were retained in the assessment: F01–F04 failed before fixes; F05 still fails the immediate-switch mock. An early safety-script timeout was corrected by using a full document navigation between fixtures. A viewport harness initially treated a hash transition's null navigation response as HTTP failure; that harness was corrected and all viewport cases rerun. A native-check attempt against the dev server encountered a dynamic-import failure during dependency reinstall; the native outage case was rerun against production with WebSocket interception and produced the expected timeout. No application build/test failure was hidden by these harness corrections.

## Untested or blocked scenarios and remaining risks

- Actual MetaMask, Rabby and other browser extensions, hardware/mobile wallets, permission UI, network-add UI and actual wallet confirmations were not exercised. Synthetic providers cannot close that acceptance gap.
- New approvals, signatures, transfers and testnet failure transactions were deliberately prohibited. Approval/settlement timing is covered at mock boundaries and by existing contract tests, not by new live transactions.
- Long-running RPC hangs, replacement/dropped transactions, deep reorg/finality behavior, all provider-failover combinations and corrupt runtime responses are not exhaustively covered.
- Accessibility testing was bounded to DOM labels, focus/tab behavior, feedback placement and viewport checks; full screen-reader/contrast and real-device testing remain.
- Browser-local history can be cleared or modified and does not synchronize across devices. Losing a hash or transaction calldata can impede recovery. Prior token approval is not rolled back when settlement fails, and approval transactions have no separate persisted receipt-recovery workflow comparable to settlement.
- Fixed-token behavior assumes bool-returning full-amount transfers and correct EVM/runtime rollback. Fee-on-transfer/rebasing/dishonest tokens, malformed token returns and all runtime deposit/funding edge cases are outside current proof.
- Replay protection is payer-and-contract scoped. It cannot authenticate an issuer, prevent the same commercial obligation being paid under another number/wallet, or protect compromised keys/frontends.
- Payment data is public and correlatable. There is no mainnet support, native SS58 payout, sponsored onboarding, cross-chain settlement or independent security audit.
- Keep F05 open and repeat wallet acceptance plus the fixed CSV/picker/keyboard paths on the eventual live release. Publishing and any subsequent blockchain transactions require separate authorization.
