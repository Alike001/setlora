# Setlora final acceptance report

## Recommendation

**CONDITIONAL GO for a wallet-free Portaldot V3 testnet hackathon walkthrough.** Phase 4 verifies the published application bytes and live settlement evidence. Full real-wallet acceptance remains **BLOCKED** because no usable wallet extension/provider is available in the audit browser. Week 2 check-in is submitted; this is preparation for the final release, not a new check-in. No mainnet or real-money readiness is claimed.

Conditions before calling the full wallet-connected final release accepted:

1. Complete a real browser-wallet smoke matrix for the Phase 3B fix. F05 code is fixed and its published bundle matches the verified local build; real-extension acceptance remains pending. Current evidence for wallet interaction is synthetic, not a MetaMask/Rabby extension certification.
2. Keep the real-wallet results distinct from publication evidence. Phase 4 confirms that the published application matches the build from `76eaccc53d2d450df94f969bd5dbb88e2f09e2ea`; any later application change needs a new authorized publication and verification. This audit itself did not push or deploy.
3. Retain the testnet-only limitations and unknown-transaction recovery guidance. Further security work remains necessary before any mainnet consideration.

No unsafe broadcast or false chain confirmation was observed in the exercised scenarios. That is bounded evidence, not an independent security audit or exhaustive verification. Phase 3B closes the reproduced F05 defect in code, and Phase 4 verifies its published bytes. The full wallet-connected release remains conditional on real wallet-extension acceptance and the explicitly untested scenarios below; a passing mock is not a real-extension result.

## Scope and evidence boundaries

- Audit date: **November 4, 2026**.
- Phase 3 starting branch/HEAD: `main`, `547c59cb5130cabb5d6705d7ca818b9580ac6a30`; Phase 3B starts from acceptance commit `dae19a5c43c15bbc33a9f72361db5013cea6bfe2`; Phase 4 audits `76eaccc53d2d450df94f969bd5dbb88e2f09e2ea`.
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
| F05 | With an immediate synthetic network switch, `connect()` reports wrong network even though raw `eth_chainId` already returns V3. A subsequent connection succeeds. | Medium; **fixed in Phase 3B; published bytes verified in Phase 4**. Real-extension acceptance remains BLOCKED. | Confirmed ethers prior-network return behavior; revision-guarded raw identity reads and a chain-bound transaction boundary replace the old check. See the Phase 3B results below. |

Phase 3 changed only CSV validation, picker display and CSV button wiring/busy state. Phase 3B also changes wallet identity/session validation and the final wallet request guard. Contract methods, recipient/amount encoding, settlement evidence verification, token configuration and Solidity contracts remain unchanged.

### F05 initial Phase 3 observation, superseded by the Phase 3B fix

Reproduction with a fresh synthetic provider:

1. `eth_requestAccounts` returns a public fixture account; initial `eth_chainId` returns `0x1`.
2. `wallet_switchEthereumChain` immediately updates the provider to `0x190f1ca9`.
3. The next raw `eth_chainId` returns V3, but `connect()` throws `Wallet is on the wrong network. Switch to Portaldot V3.`
4. Connecting again with the provider already on V3 works.

The initial audit suspected network caching but did not establish the internal cause. Phase 3B confirmed the exact ethers 6.17.0 behavior and implemented the focused fix described in the final section of this report. The sequence above is the historical reproduction, not current network-switching behavior.

Setlora no longer requests `wallet_switchEthereumChain` or `wallet_addEthereumChain`: users select V3 in their wallet and explicitly connect/review. Returning to V3 refreshes read-only feedback without reviving an old review or requesting payment.

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
| Wrong-network connection | **PASS with Phase 3B mocks** | Raw revision-guarded reads accept V3 immediately and retain genuine wrong-network errors. Switching is manual. Real extension acceptance remains untested. |
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

## Phase 3 quality gates and reproducibility (historical baseline)

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

Exploratory failures were retained in the assessment: F01–F04 failed before fixes; F05 failed the immediate-switch mock in Phase 3 and is fixed by the subsequent Phase 3B changes. An early safety-script timeout was corrected by using a full document navigation between fixtures. A viewport harness initially treated a hash transition's null navigation response as HTTP failure; that harness was corrected and all viewport cases rerun. A native-check attempt against the dev server encountered a dynamic-import failure during dependency reinstall; the native outage case was rerun against production with WebSocket interception and produced the expected timeout. No application build/test failure was hidden by these harness corrections.

## Untested or blocked scenarios and remaining risks

- Actual MetaMask, Rabby and other browser extensions, hardware/mobile wallets, permission UI, network-add UI and actual wallet confirmations were not exercised. Synthetic providers cannot close that acceptance gap.
- New approvals, signatures, transfers and testnet failure transactions were deliberately prohibited. Approval/settlement timing is covered at mock boundaries and by existing contract tests, not by new live transactions.
- Long-running RPC hangs, replacement/dropped transactions, deep reorg/finality behavior, all provider-failover combinations and corrupt runtime responses are not exhaustively covered.
- Accessibility testing was bounded to DOM labels, focus/tab behavior, feedback placement and viewport checks; full screen-reader/contrast and real-device testing remain.
- Browser-local history can be cleared or modified and does not synchronize across devices. Losing a hash or transaction calldata can impede recovery. Prior token approval is not rolled back when settlement fails, and approval transactions have no separate persisted receipt-recovery workflow comparable to settlement.
- Fixed-token behavior assumes bool-returning full-amount transfers and correct EVM/runtime rollback. Fee-on-transfer/rebasing/dishonest tokens, malformed token returns and all runtime deposit/funding edge cases are outside current proof.
- Replay protection is payer-and-contract scoped. It cannot authenticate an issuer, prevent the same commercial obligation being paid under another number/wallet, or protect compromised keys/frontends.
- Payment data is public and correlatable. There is no mainnet support, native SS58 payout, sponsored onboarding, cross-chain settlement or independent security audit.
- F05 code is fixed by Phase 3B and its published bytes are verified in Phase 4; real wallet acceptance remains blocked. Repeat wallet-dependent network/CSV/picker/keyboard paths with actual extensions on the live site. Publishing and any subsequent blockchain transactions require separate authorization.

## Phase 3B — wallet network race fix

**Phase 3B result: F05 fixed locally; CONDITIONAL GO for the testnet demonstration.** No reproduced network/readiness blocker remains in the deterministic scenarios below. Real browser-extension smoke tests and a separately authorized publication followed by live regression checks remain release conditions. This phase did not push, deploy, sign, approve tokens or create any blockchain transaction. The earlier deployment/settlement observations remain historical reads from Phase 3; they were not replaced with synthetic evidence.

### Confirmed root cause

Before editing, a minimal reproduction against the installed **ethers 6.17.0** produced:

```text
Raw eth_chainId replies:             1 -> 420420777 -> 420420777
BrowserProvider('any').getNetwork(): 1 -> 1         -> 420420777
```

In ethers' `AbstractProvider.getNetwork()`, the changing `any`-network call detects the actual chain and updates its internal network promise, but returns the old `expected.clone()` for that call. Setlora's old `connect()` treated that return as a fresh identity check immediately after switching. This explains the false wrong-network error; an arbitrary cache delay was not the established cause, and adding sleeps or an extra `getNetwork()` call would not address asynchronous state races.

Two application-level gaps increased the risk of stale state: initial account/chain events were ignored while connecting, and payment review could use prior session readiness without fresh wallet identity checks. Existing `sessionVersion` checks protected many delayed balance responses; listener duplication was not the original cause. Regressions now explicitly cover single observer registration and cleanup.

### Implemented fix

- [wallet-network.js](../web/src/wallet-network.js) maintains one observer per selected injected provider. Account, chain and disconnect events invalidate the event revision and reject pending identity checks. Each raw read has a monotonically increasing request sequence; a superseded response cannot win over a newer check.
- Identity comes from fresh `eth_accounts` and `eth_chainId` responses, not ethers' prior-network return value or the event payload alone. Malformed/unavailable identity is unverified, not ready. Only connection/restore can retry a bounded burst of events; a financial authorization never retries automatically after a change.
- Verified ethers providers are bound to V3 and the specific authorized account. Signer construction uses the already-verified address and cannot implicitly request another account-access permission prompt.
- Before a wallet `eth_sendTransaction` handoff, the wrapper checks the original session revision, re-reads account/chain, verifies the sender and chain, and includes the expected chain ID in the request. Unit tests hand only synthetic requests to a deterministic mock. No actual signing or send method reached a real provider.
- Review checks identity before public RPC work and again before committing ready results. Approval and settlement retain fresh prechecks; the final handoff guard also covers a change during intermediate asynchronous work. Failed fresh checks invalidate local readiness even if a provider omitted an event.
- Events immediately clear review, balances and allowance readiness. Read-only feedback remains attached to the selected provider, so returning to V3 is recognized. It never revives an old review: reconnect and review are explicit. Latest-response checks also prevent older feedback/errors from replacing the latest network message.
- Connection no longer requests network switching or network addition. Users select Portaldot V3 in their wallet themselves. Returning to V3, reconnecting and refreshing do not request approval or payment.
- Pending transaction recovery keys/records are untouched by network/account invalidation or disconnect. Wallet metadata can be forgotten; settlement recovery evidence is retained. Token configuration, deployment addresses, Solidity and payment amounts/recipients are unchanged. No CSS was added or modified.

### Deterministic regression coverage

[wallet-network.test.js](../web/test/wallet-network.test.js) adds **15 tests** using controlled promises, not timing sleeps:

| Required scenario | Result and evidence |
| --- | --- |
| Rapid V3/other/V3 switching | PASS; old revision is rejected and only the latest chain is usable. The original ethers return behavior also has a minimal reproduction test. |
| Multiple events close together | PASS; the prior session revision is invalidated, with exactly one registered observer per event. |
| Old RPC responses arriving last | PASS in both directions: stale success cannot override a newer wrong-network result; stale wrong-network cannot override a newer V3 result. |
| Account change during verification | PASS; old signer acquisition is rejected; bounded connection verification selects the new current account. |
| Disconnect during a pending check | PASS; rejection occurs before the delayed old response arrives; late completion cannot resurrect a session. |
| Refresh after changing networks | PASS; prior authorization is not silently restored on another chain. Restore uses read-only methods. |
| Return to V3 | PASS; a new verified session succeeds while the old reviewed signer remains invalid. |
| Unresolved chain identity | PASS; both approval and settlement transaction request shapes remain blocked at the synthetic handoff boundary. |
| Genuine wrong network | PASS; wrong chain, invalid chain data and missing account are rejected instead of being treated as ready. |
| Handoff/account safety and listener cleanup | PASS; synthetic requests are chain-bound, even eventless account changes are checked, and detach/reattach does not duplicate listeners. |

[acceptance-network.browser.js](../web/scripts/acceptance-network.browser.js) uses the actual application, `chain.js`, wallet session and network observer against synthetic EIP-1193 and read-only HTTP fixtures. **24 assertions passed**, including immediate invalidation, older replies arriving last, eventless chain-change detection before settlement, wrong-network connection, account changes, pending disconnect, recovery-record preservation, refresh, return/reconnect, absence of automatic switching/signing/sending, and the viewport checks below.

The existing [UI browser regression](../web/scripts/acceptance-ui.browser.js) passed **7 assertions** and the [transaction safety browser script](../web/scripts/acceptance-safety.browser.js) passed **21 assertions**. The latter's fixture now supplies the new read-only restore export; its synthetic financial boundary remains isolated. Total browser assertions in this phase: **52 passed**. These MCP scripts are run explicitly and are not part of `npm test` or automatic CI; the new 15 Node tests are included in the existing frontend CI suite.

### Browser layout checks

At **390px**, **768px** and **1440px**, the new browser script checked a populated review, network error message and connection controls. Document width equalled viewport width; review actions stayed within the viewport and messages wrapped without horizontal page overflow. Error-state screenshots were saved with unique names under the existing untracked `.playwright-mcp/` directory; representative mobile/desktop screenshots were visually inspected. Existing styling was preserved. These checks do not replace real-device, screen-reader or full accessibility certification.

### Full Phase 3B quality gates

| Check | Result |
| --- | --- |
| Frontend `npm ci` | PASS; zero reported vulnerabilities |
| Frontend `npm test` on Node 22.23.4 | **94 passed, 0 failed**: 79 prior tests plus 15 new network tests |
| Frontend production build | PASS |
| Documentation `npm ci` | PASS; zero reported vulnerabilities |
| Documentation `npm run check:content` | PASS; 9 pages / 5 internal links |
| Documentation standalone build | PASS |
| Combined `npm run build:site` | PASS |
| Required combined HTML outputs | PASS; all nine application/documentation paths listed in the baseline section exist and are nonempty |
| Foundry `forge test -vv` | **9 passed, 0 failed** |
| Foundry `forge build` | PASS with the previously recorded lint warnings |
| Browser regressions | **52 assertions passed**: 24 network, 21 safety, 7 UI |
| Diff and syntax checks | PASS |

Dependency deprecations, Rollup annotation/bundle-size advisories, Astro optional-content/404 warnings and Foundry security lint warnings remain as described in the baseline. They did not fail a gate and were not suppressed. No independent security audit is claimed.

Full command logs are local session evidence in `/tmp/setlora-phase3b-2ebum87v/`; browser screenshots remain untracked. During test development, an initial microtask-polling fixture prevented a provider request from starting; it was stopped and replaced with an explicit request-start promise. One existing UI file-chooser automation attempt timed out, then passed unchanged on two subsequent runs. The successful results above are from the corrected deterministic tests and completed browser runs, not an assumption based on compilation.

### Remaining release conditions and limits

- Actual MetaMask/Rabby/other EVM extension confirmation and permission screens, mobile wallets and hardware wallets remain untested here. The fix uses standard account/chain reads and event registration/removal, but mocks cannot certify all providers.
- A continuously changing wallet exhausts bounded connection retries and requires a new explicit connection after it stabilizes. A provider that never responds stays unverified; no financial action is authorized. No automatic network switch, approval or transaction is used as recovery.
- The wallet remains responsible for enforcing the requested account/chain and confirmation after handoff. An app cannot cancel a request already accepted by a wallet; the existing unknown/pending transaction recovery behavior remains essential.
- This phase validates local source and production builds. It does not establish that the unpublished fix is present on the live site. Publish only with separate authorization and repeat the network, CSV, picker and keyboard smoke tests there.
- Existing testnet-only, no-audit, browser-local-history, token/runtime and privacy limitations remain. No mainnet release recommendation is made.

## Phase 4 — post-publication verification and real-wallet acceptance support

**Final recommendation: CONDITIONAL GO for the wallet-free testnet walkthrough; full real-wallet acceptance is BLOCKED.** Published code, read-only settlement evidence, navigation and bounded browser accessibility checks pass. No confirmed UI defect required a source change. This phase changes only this report and does not authorize or perform a push, deployment, financial signature or transaction.

### Publication verification

Audit snapshot: `main` at **`76eaccc53d2d450df94f969bd5dbb88e2f09e2ea`**, with no pre-existing tracked changes. Existing untracked work, wallet backups, deployment evidence and browser artifacts were preserved.

All requested live URLs returned HTTP 200 with the expected page content in **Chromium 153.0.8010.52**:

| URL | Result |
| --- | --- |
| `https://setlora.pages.dev/` | PASS — landing page |
| `https://setlora.pages.dev/app` | PASS — payment workspace |
| `https://setlora.pages.dev/proof` | PASS — public verifier |
| `https://setlora.pages.dev/native` | PASS — native account checker |
| `https://setlora.pages.dev/docs/` | PASS — documentation index |
| `https://setlora.pages.dev/docs/how-to-test/` | PASS — judge guide |

A fresh combined build used Node 22.23.4 and the verified public contract address. At **2026-11-04 15:30:48 UTC**, normal same-origin browser fetches retrieved **41 HTML/static files**: six HTML entry points, 23 JavaScript files, 11 stylesheets and the site SVG. **All 41 returned HTTP 200 and matched the local build byte for byte by SHA-256.** This includes the Phase 3B network fix, application configuration, dynamic native checker code and documentation/search assets.

Key published artifacts:

| Artifact | SHA-256 |
| --- | --- |
| `assets/app-DeBvlAUr.js` | `fae797e04649bc2f2b25c11c5010e8119cfd8ef43794c2d9b88884c3e94b4f98` |
| `assets/chain-BDYCKX3J.js` | `6cb159ec92f64d71534e33b8697a6a71f84e6a45d3e4e5c3d4313629cf448ee5` |
| `assets/config-D4rEZxvL.js` | `1859d2abed1eaf46d5d21f85a889741a443c89c658da099cb3282de9e84b9fde` |

This establishes published application-byte equivalence to the expected build. No hosting deployment API/commit-SHA record was inspected, so the hosting platform's exact recorded deployment commit is not independently asserted. The later report-only commit does not change generated application assets.

Loading/navigation checks found no runtime or console errors, broken images, HTTP asset errors or failed asset requests in the six-page load run. All **16 unique same-origin navigation paths** discovered from those pages returned the expected HTML, including `.html` application links and all nine documentation guides. Documentation search returned the expected verification and wallet guides, exercising its lazy-loaded search resources.

Observations retained rather than hidden:

- An initial command-line `urllib` comparison received HTTP 403 for the same URLs. The normal browser loads and browser fetches returned 200; the successful 41-file digest comparison used those actual browser responses. Non-browser client access is not certified by this audit.
- One documentation `ui-core` request reported `net::ERR_ABORTED` during rapid page navigation. That asset independently returned 200 with a matching digest; an isolated judge-guide/search rerun completed with zero failed requests or runtime errors. This was not treated as a missing asset.
- An initial search harness selected `input[type="search"]` and timed out. The actual named Search textbox is `type="text"`; the corrected accessible-role locator produced working search results. This was a test-selector failure, not a production search defect.

### Fresh read-only blockchain evidence

At **2026-11-04 15:28:36 UTC**, direct read-only RPC calls rechecked:

- Network chain ID `420420777`; expected contract `0x2d17199920251f7eec8a555043c8387194ff5d1b` with bytecode present.
- Immutable token `0x00001E6100000000000000000000000000010000`, six decimals.
- Existing transaction `0x0ea4730fc73f3842a80f3015ee682ffa2bc0c5312fccf272d9899ee3ec1e3c16`: successful receipt to the expected contract at block **262291**, with a matching canonical block hash. The transaction object was also available and identified V3.
- Exactly three `InvoiceSettled` events from the expected contract: invoice 1001 / 100,000 base units, 1002 / 150,000, and 1003 / 200,000; recipients and payer matched the evidence table above.
- Exactly one matching `BatchSettled` event: count **3**, total **450,000 base units = 0.45 test pUSD**.
- `isSettled(payer, 1001)`, `1002` and `1003` all **true**.

The live wallet-free verifier separately displayed **Verified**, the expected payer/contract, all three invoices and **0.45 pUSD**. Its observed RPC methods were only `eth_chainId`, `eth_getCode`, `eth_call`, `eth_getTransactionReceipt`, `eth_getTransactionByHash` and `eth_getBlockByNumber`.

Both settlement checks used the configured Portaldot V3 RPC; this is not independent-node or consensus verification.

The live native checker also completed a read for the invoice 1001 preset: existing liquid pUSD holder, 0.1 pUSD, minimum 0.01 pUSD, providers 1 / sufficients 0. It correctly states that this is not a guarantee of future transfer success. It remains a read-only checker, not native-address settlement.

### Accessibility and responsive browser results

At **390px, 768px and 1440px**, eight rendered surfaces were checked: landing page, preparation, review, history, public verifier, native checker, docs index and judge guide. **All 24 surface/viewport combinations** had document scroll width equal to viewport width, no broken images and accessible names for the visible form controls inspected. Review/history checks in this phase covered their disconnected states; actual wallet-connected populated states remain blocked.

Additional live keyboard/form checks passed:

- Landing mobile Menu opens with Enter; its Documentation link navigates by keyboard. Documentation Menu and judge-guide links also work by keyboard.
- Invoice, recipient, amount and note fields have accessible names and visible focus outlines at all three widths. CSV import participates in focus navigation; Escape closes the no-wallet picker.
- Empty invoice validation places focus on the identified invoice field, sets `aria-invalid="true"`, and presents visible feedback with `role="status"` / `aria-live="polite"`.
- Invalid public-proof hash and native address produce readable errors in polite status regions and hide results; they never show a false confirmation.
- Valid disconnected Review opens the wallet picker, explains that no wallet is detected, and leaves approval and settlement disabled.
- The documentation code-copy controls have the accessible name **Copy to clipboard** through their `title` attributes. A preliminary text/ARIA-only DOM scan omitted that fallback and flagged two controls; the actual accessibility tree confirmed both names, so no label patch was warranted.

Unique error-state screenshots for mobile/tablet/desktop were captured and visually inspected. Existing application CSS, forms and payment logic were unchanged. These are viewport emulation and DOM/accessibility-tree checks, not physical-device, full contrast/WCAG or screen-reader auditory certification. Live-region attributes were inspected; actual spoken announcements were not tested.

### Real-wallet acceptance — BLOCKED

The audit browser exposes **no `window.ethereum.request`**, no EIP-6963 provider announcements after discovery, and no active extension service workers. Setlora's actual picker reports **No EVM wallet detected**. This establishes that no usable wallet provider is available in this browser; it does not assert that the user's separate desktop browser has no installed wallets.

| Actual extension acceptance case | Result |
| --- | --- |
| Connect/account-access permission | **BLOCKED — no available extension/provider** |
| Disconnect and permission revocation | **BLOCKED — no available extension/provider** |
| MetaMask/Rabby account selection | **BLOCKED — no available extension/provider** |
| Manual wallet network switching | **BLOCKED — no available extension/provider** |
| Rapid chain-change recovery | **BLOCKED — no available extension/provider** |
| Wallet-dependent review invalidation and reconnect | **BLOCKED — no available extension/provider** |
| Authorized wallet restoration on refresh | **BLOCKED — no available extension/provider** |

No synthetic provider was installed or used as evidence of a real-extension test in this phase. Phase 3B's 52 mocked browser assertions remain separately labelled historical evidence, not a replacement for the blocked matrix.

### Concise manual real-wallet checklist

Run separately in the user's actual MetaMask and Rabby browsers/extensions where available. Record browser/OS, extension name/version, viewport, expected/actual behavior, PASS/FAIL/BLOCKED and public screenshots. Do not provide private keys, seed phrases or backup files to the agent. **Do not click token approval or settlement, request financial signatures, or send any transaction.**

1. Open [the live workspace](https://setlora.pages.dev/app). Manually select **Portaldot V3 Testnet, chain ID 420420777** in the wallet. Click Connect and authorize only site/account access. Confirm the displayed public account and expected contract; inspect balance/allowance without changing them.
2. Choose a fresh invoice ID (not a previously paid ID), the recorded invoice 1001 EVM recipient, and a small test amount such as 0.01 pUSD. Click **Review only**. If balance or recipient simulation blocks review, record the message and mark the ready-review-dependent case BLOCKED; do not fund/approve/pay merely to complete this checklist.
3. Use **Switch account** to choose another already-authorized account. The old review must clear, payment actions must disable, and reconnect/review must use the newly selected account. Repeat Change wallet with another installed supported extension if available; the chosen provider must be used.
4. From a reviewed batch, manually switch to another already-configured EVM network. Review/readiness must invalidate immediately; approval and settlement must remain disabled. The app should show checking/unverified and then the genuine wrong-network message. It must not automatically switch the wallet or open a financial confirmation.
5. Switch between that network and V3 several times, then leave V3 selected. Old responses must not restore an outdated error or ready review. Expect **V3 detected; reconnect and review**. Reconnect explicitly, then Review only; the current account/network must be used.
6. Refresh while on the wrong network: old wallet readiness must not silently restore. Return to V3 manually and reconnect. If genuine pending recovery information already exists, verify that it remains available for its payer; do not edit browser storage, invent a payment, or resend anything to test recovery.
7. Disconnect through the app. Local readiness/review must clear. If revocation is supported, check site access in the wallet; otherwise the app must honestly direct removal through wallet settings. Repeat at mobile/tablet/desktop widths available to the tester and capture any unreadable/overflowing state.

Stop on a failure or unexpected signing/payment prompt and report the case, visible message and public screenshot. Real-wallet acceptance remains BLOCKED until this checklist has actual recorded outcomes; no pass is assumed from these instructions.

### Phase 4 validation, changes and final limits

| Validation | Result |
| --- | --- |
| Frontend `npm test`, Node 22.23.4 | **94 passed, 0 failed** |
| Documentation `npm run check:content` | PASS — 9 pages / 5 internal links |
| Combined `npm run build:site` | PASS — builds docs and the application together |
| Publication comparison | **41/41 byte-identical browser responses** |
| Requested live pages / discovered same-site paths | **6/6 requested pages and 16/16 paths passed** |
| Read-only settlement evidence | PASS — receipt, three events, 0.45 pUSD, flags |
| Responsive surface checks | **24/24 passed** within the stated DOM/layout scope |
| Real wallet extensions | **BLOCKED**, not simulated |
| Report links and diff checks | PASS |

The report is the only tracked file changed in this phase. Application source, contracts, token configuration, wallet/payment logic and deployment settings were not modified. Unchanged Foundry tests were not rerun here; the prior Phase 3B result of nine passing tests remains historical evidence. Existing nonfatal dependency/build warnings remain documented; none was suppressed.

Local session evidence: `/tmp/setlora-phase4-8n02w7ox/` contains command logs, browser publication digests and flow observations; `/tmp/setlora-phase4-chain-XdOrAc/evidence.json` contains public RPC reads. Unique screenshots were added under the preserved untracked `.playwright-mcp/` directory. These are local artifacts; the observations and manual checklist above are the committed record.

**Remaining blocker:** real-wallet acceptance is not complete. Full screen-reader/real-device coverage and the existing testnet/security limitations also remain. Publication-byte verification is now complete for the audited application build. No push, deployment or financial operation is authorized by this report.
