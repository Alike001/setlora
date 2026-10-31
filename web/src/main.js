import { ethers } from 'ethers';
import { TOKEN, RPC, CONTRACT_ADDRESS, CHAIN_ID } from './config.js';
import { validateInvoices, MAX_INVOICES, parseUnitsExact } from './invoice.js';
import { parseCsv } from './csv.js';
import { connect, assertActiveWallet, batchRead, readWallet, checkAlreadySettled, approveExactAmount, sendBatch, verifySettlement, recoverHistoricalSettlement, preflightRecipients, preflightWholeBatch } from './chain.js';
import { isUnresolved, makeVerifiedReceipt, isWalletRejection, attachRecoveredHash } from './status.js';
import { recoveryActionState } from './recovery.js';
import { draftStorageKey, loadDraft, saveDraft, hasDraftContent, EMPTY_ROW } from './draft.js';
import { startWalletDiscovery, requestWalletDiscovery, walletChoices } from './wallets.js';
import { rememberWallet, forgetWallet, rememberedWallet, findWalletChoice, isWalletStillAuthorized, requestAccountReselection } from './wallet-session.js';
import { readHistory, addVerifiedHistory, totalHistoryAmount } from './history.js';

const $ = id => document.getElementById(id);
let rows = [{ ...EMPTY_ROW }];
let session = null;
let review = null;
let allowance = 0n;
let tokenBalance = 0n;
let busy = false;
let last = null;
let sessionVersion = 0;
let sessionReady = false;
let connecting = false;
let connectedProvider = null;
let connectedChoice = null; // Exact wallet provider selected by the user.
const STORAGE_KEY = 'setlora:pending:v2';
const PREVIOUS_STORAGE_KEY = 'setlora:pending:v1';
let attemptingRestore = false;
let historicalVerified = null; // only verified by fresh read-only RPC during this session

function shorten(s) { return s ? `${s.slice(0, 6)}…${s.slice(-4)}` : '—'; }
function amountText(amount) { return ethers.formatUnits(amount, 6); }
function currentDraftKey() {
  if (!session || !sessionReady || !ethers.isAddress(CONTRACT_ADDRESS)) return null;
  return draftStorageKey(CHAIN_ID, CONTRACT_ADDRESS, session.address);
}
function draftStatus(message) { $('draft-status').textContent = message; }
function persistDraft() {
  const key = currentDraftKey();
  if (!key) { draftStatus('Connect wallet to save drafts.'); return; }
  try {
    const saved = saveDraft(localStorage, key, rows);
    draftStatus(saved ? 'Draft saved on this browser.' : 'No draft saved.');
  } catch {
    draftStatus('Draft could not be saved. Export a CSV backup.');
  }
}
function restoreDraftForWallet() {
  const key = currentDraftKey();
  if (!key) return;
  const stored = loadDraft(localStorage, key);
  if (stored && hasDraftContent(stored) && !hasDraftContent(rows)) {
    rows = stored;
    renderRows();
    review = null;
    renderReviewItems(null); renderRecipientChecks(null);
    draftStatus('Your saved draft was restored. Review it again before paying.');
    return;
  }
  if (stored && hasDraftContent(rows)) {
    // Don't overwrite either the old saved draft or values typed before connecting.
    draftStatus('Existing draft is saved. Editing these entries will replace it.');
    return;
  }
  persistDraft();
}

function setMessage(el, message, level = 'muted') { el.className = `message ${level}`; el.textContent = message; }
function ownsSavedTransaction() {
  return Boolean(session && typeof last?.payer === 'string' && last.payer.toLowerCase() === session.address.toLowerCase());
}
function activeSession(snapshot, version) {
  return Boolean(snapshot && sessionReady && session === snapshot && sessionVersion === version);
}
function assertSession(snapshot, version) {
  if (!activeSession(snapshot, version)) throw new Error('Wallet changed during this operation. Reconnect and review again.');
}
function resetWalletState(message = 'Wallet disconnected. Connect to review account balances or make payments.', level = 'muted', clearForm = false) {
  // Invalidate the local wallet session before any wallet request completes.
  // Never erase the persisted settlement evidence or clear an unknown broadcast.
  ++sessionVersion;
  forgetWallet(localStorage);
  unlistenWallet();
  session = null; sessionReady = false; review = null; connectedChoice = null;
  historicalVerified = null;
  tokenBalance = 0n; allowance = 0n;
  $('balance').textContent = '—';
  $('allowance').textContent = '—';
  $('connect').textContent = 'Connect wallet';
  $('connect').hidden = false;
  $('wallet-menu').hidden = true;
  $('wallet-menu').open = false;
  renderReviewItems(null); renderRecipientChecks(null);
  if (clearForm) { rows = [{ ...EMPTY_ROW }]; renderRows(); }
  draftStatus('Connect wallet to restore saved drafts.');
  setMessage($('network-status'), message, level);
  setMessage($('review-status'), 'Connect and review this batch before approving or settling.');
  updateTxBox(); buttons(); renderHistory();
}
function showConnectedWallet(address) {
  $('connect').hidden = true;
  $('wallet-menu').hidden = false;
  $('wallet-menu').open = false;
  $('wallet-address').textContent = `${shorten(address)} ▾`;
  $('wallet-address').title = address;
}
function buttons() {
  $('add').disabled = busy || rows.length >= MAX_INVOICES;
  $('review').disabled = busy;
  $('approve').disabled = busy || !review || !sessionReady || !session || allowance >= review.total || tokenBalance < review.total || isUnresolved(last);
  $('settle').disabled = busy || !review || !sessionReady || !session || allowance < review.total || tokenBalance < review.total || isUnresolved(last);
  $('approve').textContent = review && allowance >= review.total
    ? 'Token approval already sufficient ✓'
    : '1. Approve exact token amount';
  $('settle').textContent = review && allowance >= review.total
    ? 'Confirm batch payment'
    : '2. Confirm batch settlement';
  $('check-tx').disabled = busy || !ownsSavedTransaction() || !last?.hash;
  $('export-receipt').disabled = busy || !ownsSavedTransaction() || !last?.hash || last?.status !== 'confirmed';
  const recovery = recoveryActionState({
    inputHash: $('manual-hash').value,
    record: last,
    ownsRecord: ownsSavedTransaction(),
    connected: Boolean(sessionReady && session),
    busy,
    unresolved: isUnresolved(last)
  });
  // A verified hash can always be rechecked read-only, instead of looking broken.
  // An unresolved broadcast with a hash remains protected against replacement.
  $('restore-hash').disabled = recovery.disabled;
  $('restore-hash').textContent = recovery.label;
  $('connect').disabled = busy;
  $('copy-wallet').disabled = busy;
  $('switch-wallet').disabled = busy;
  $('disconnect-wallet').disabled = busy;
}
function updateSummary() {
  $('count').textContent = String(rows.length);
  try {
    const validated = validateInvoices(rows, ethers.isAddress);
    $('total').innerHTML = `${amountText(validated.total)} <small>pUSD</small>`;
  } catch { $('total').innerHTML = `— <small>pUSD</small>`; }
}
function resetReview() {
  review = null;
  renderReviewItems(null); renderRecipientChecks(null);
  setMessage($('review-status'), 'Invoice details changed. Review this batch again before approval or settlement.');
  updateSummary(); buttons();
}
function renderRecipientChecks(result) {
  const panel = $('recipient-readiness');
  panel.replaceChildren();
  if (!result) return;
  for (const check of result.checks) {
    const row = document.createElement('div');
    row.className = `readiness-row ${check.status}`;
    const title = document.createElement('strong');
    title.textContent = `Invoice #${check.invoice} · ${shorten(check.recipient)}`;
    const description = document.createElement('span');
    description.textContent = check.status === 'ready'
      ? 'Recipient can receive this simulated pUSD transfer.' : check.message;
    row.append(title, description);
    panel.append(row);
  }
  if (!result.ready) {
    const help = document.createElement('p');
    help.className = 'readiness-help';
    help.textContent = 'Check the affected recipient on Portaldot V3. Non-sufficient pUSD may require a native account, but do not send tPOT solely because a displayed balance is zero. After resolving the issue, click Review batch again.';
    const link = document.createElement('a');
    link.href = 'https://node-console.portaldot.dev/#/runtime';
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.textContent = 'Open Portaldot account tools';
    panel.append(help, link);
  }
}
function renderReviewItems(batch) {
  const container = $('review-items');
  container.replaceChildren();
  if (!batch) return;
  for (const item of batch.items) {
    const entry = document.createElement('div'); entry.className = 'review-item';
    const id = document.createElement('span'); id.textContent = `Invoice #${item.invoice} → ${shorten(item.recipient)}`;
    const amount = document.createElement('strong'); amount.textContent = `${amountText(item.amount)} pUSD`;
    entry.append(id, amount); container.append(entry);
  }
}
function renderRows() {
  const tbody = $('invoice-rows'); tbody.replaceChildren();
  rows.forEach((item, idx) => {
    const tr = document.createElement('tr');
    const schema = [
      ['invoice', '1', 'numeric', 'Invoice number'],
      ['recipient', '0x…', 'text', 'Recipient wallet'],
      ['amount', '0.00', 'decimal', 'pUSD amount'],
      ['note', 'Optional note', 'text', 'Optional description']
    ];
    for (const [key, placeholder, inputMode, title] of schema) {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'text'; input.placeholder = placeholder; input.value = item[key] || '';
      input.inputMode = inputMode; input.setAttribute('aria-label', `${title} for row ${idx + 1}`);
      input.maxLength = key === 'note' ? 100 : 128;
      input.addEventListener('input', () => { rows[idx][key] = input.value; resetReview(); persistDraft(); });
      td.append(input); tr.append(td);
    }
    const del = document.createElement('td');
    const button = document.createElement('button'); button.type = 'button'; button.className = 'delete'; button.textContent = '×';
    button.setAttribute('aria-label', `Remove invoice ${idx + 1}`); button.disabled = busy;
    button.addEventListener('click', () => { rows.splice(idx, 1); if (!rows.length) rows.push({ ...EMPTY_ROW }); renderRows(); resetReview(); persistDraft(); });
    del.append(button); tr.append(del); tbody.append(tr);
  });
  updateSummary(); buttons();
}
function setBusy(value) {
  busy = value; buttons();
  document.querySelectorAll('#history-list button').forEach(el=>{ el.disabled=value; });
  document.querySelectorAll('#invoice-rows input, #invoice-rows button.delete, #csvfile, #download-template').forEach(el => { el.disabled = value; });
}
function showError(e, el = $('review-status')) {
  const message = e?.shortMessage || e?.reason || e?.message || String(e);
  setMessage(el, message, 'danger');
}
function historyForWallet() {
  if (!sessionReady || !session || !ethers.isAddress(CONTRACT_ADDRESS)) return [];
  return readHistory(localStorage, CHAIN_ID, CONTRACT_ADDRESS, session.address);
}
function clearHistoricalDetail() {
  historicalVerified = null;
  $('history-detail').replaceChildren();
  $('history-export').disabled = true;
}
function renderHistoryDetail(record = null, message = '') {
  const panel = $('history-detail');
  panel.replaceChildren();
  if (!record) {
    const note=document.createElement('p'); note.className='small-note';
    note.textContent=message || 'Choose a saved payment to check its receipt again on-chain.';
    panel.append(note); return;
  }
  const heading=document.createElement('h3'); heading.textContent='Payment completed'; panel.append(heading);
  const overview=document.createElement('p'); overview.className='history-overview';
  overview.textContent=`${record.items.length} recipient(s) · ${amountText(totalHistoryAmount(record))} pUSD`;
  panel.append(overview);
  for (const item of record.items) {
    const line=document.createElement('div'); line.className='history-invoice';
    const invoice=document.createElement('span'); invoice.textContent=`Invoice #${item.invoice} · ${shorten(item.recipient)}`;
    const amount=document.createElement('strong'); amount.textContent=`${amountText(item.amount)} pUSD`;
    line.append(invoice,amount); panel.append(line);
  }
  const hash=document.createElement('code'); hash.className='history-fullhash'; hash.textContent=record.hash;
  panel.append(hash);
  const status=document.createElement('p'); status.className='small-note';
  status.textContent='Reverified against on-chain receipt, exact events, batch total, and invoice flags.';
  panel.append(status);
  $('history-export').disabled=false;
}
function renderHistory() {
  const listing=$('history-list');
  listing.replaceChildren();
  if (!sessionReady || !session) {
    const info=document.createElement('p'); info.className='small-note';
    info.textContent='Connect the paying wallet to view its saved payments on this device.';
    listing.append(info);
    clearHistoricalDetail();
    return;
  }
  const records=historyForWallet();
  if (!records.length) {
    const empty=document.createElement('p'); empty.className='small-note';
    empty.textContent='No saved completed payments yet. Verified payments will appear here. On a new browser, verify a previous hash above to add it.';
    listing.append(empty);
  }
  for (const record of records) {
    const entry=document.createElement('div'); entry.className='history-entry';
    const info=document.createElement('div');
    const label=document.createElement('strong'); label.textContent=`${amountText(totalHistoryAmount(record))} pUSD · ${record.items.length} recipients`;
    const subtitle=document.createElement('span'); subtitle.className='small-note';
    subtitle.textContent=`${shorten(record.hash)} · saved on this browser`;
    info.append(label,subtitle);
    const action=document.createElement('button'); action.type='button'; action.className='button subtle';
    action.textContent='Recheck payment'; action.disabled=busy;
    action.addEventListener('click',()=>recheckHistory(record.hash));
    entry.append(info,action); listing.append(entry);
  }
  if (historicalVerified && !records.some(r=>r.hash.toLowerCase()===historicalVerified.hash.toLowerCase())) {
    clearHistoricalDetail();
  }
}
async function recheckHistory(hash) {
  if (busy || !session || !sessionReady) return;
  const record=historyForWallet().find(r=>r.hash.toLowerCase()===String(hash).toLowerCase());
  if (!record) return;
  const snapshot=session, version=sessionVersion;
  historicalVerified=null; $('history-export').disabled=true;
  renderHistoryDetail(null,'Rechecking this payment on Portaldot V3. Nothing will be sent.');
  setBusy(true);
  try {
    const items=record.items.map(x=>({invoice:BigInt(x.invoice),recipient:x.recipient,amount:BigInt(x.amount)}));
    const result=await verifySettlement(record.hash, record.payer, items, snapshot.provider);
    assertSession(snapshot,version);
    if (result.status !== 'confirmed') throw new Error(`Payment cannot be verified right now: ${result.reason}`);
    const confirmed={...record,status:'confirmed',checkedAt:new Date().toISOString(),message:result.reason};
    addVerifiedHistory(localStorage, CHAIN_ID, CONTRACT_ADDRESS, snapshot.address, confirmed);
    historicalVerified=confirmed;
    renderHistoryDetail(confirmed);
    setMessage($('history-status'), 'Payment reverified. Receipt and all invoice events match the blockchain.', 'good');
  } catch (e) {
    if (activeSession(snapshot,version)) {
      historicalVerified=null;
      renderHistoryDetail(null,'Verification incomplete; no new payment was sent.');
      setMessage($('history-status'), e?.shortMessage || e?.message || String(e), 'warn');
    }
  } finally { setBusy(false); renderHistory(); }
}
function exportHistoryReceipt() {
  if (!historicalVerified || !sessionReady || !session || historicalVerified.payer.toLowerCase()!==session.address.toLowerCase()) return;
  try {
    const receipt=makeVerifiedReceipt(historicalVerified, CHAIN_ID, CONTRACT_ADDRESS);
    const url=URL.createObjectURL(new Blob([JSON.stringify(receipt,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`setlora-receipt-${historicalVerified.hash.slice(2,10)}.json`;
    document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
  } catch(e) { showError(e,$('history-status')); }
}
function savedTx() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return JSON.parse(current);
    const old = localStorage.getItem(PREVIOUS_STORAGE_KEY);
    if (!old) return null;
    const recovered = JSON.parse(old);
    if (recovered) localStorage.setItem(STORAGE_KEY, JSON.stringify(recovered));
    return recovered;
  } catch { return null; }
}
function saveTx(record) {
  last = record;
  if (record) localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  else localStorage.removeItem(STORAGE_KEY);
  if (record?.status === 'confirmed' && sessionReady && session
      && record.payer?.toLowerCase()===session.address.toLowerCase()) {
    addVerifiedHistory(localStorage, CHAIN_ID, CONTRACT_ADDRESS, session.address, record);
  }
  updateTxBox(); buttons(); renderHistory();
}
function updateTxBox() {
  // Retain saved recovery evidence, but never show a previous payer's receipt
  // or hash to another connected account (or on a disconnected screen).
  if (last && !ownsSavedTransaction()) {
    const message = !session
      ? 'Saved payment evidence remains in this browser. Reconnect the payer wallet to view or recover it.'
      : 'A different wallet has locally saved payment evidence. Reconnect its payer wallet before reviewing that transaction.';
    setMessage($('transaction-status'), message, 'warn');
    $('evidence').replaceChildren();
    return;
  }
  if (!last) { setMessage($('transaction-status'), 'No payment loaded in this browser. Paste an existing transaction hash below to verify it on-chain.'); $('evidence').replaceChildren(); return; }
  const status = last.status || 'unknown';
  const level = status === 'confirmed' ? 'good' : status === 'failed' || status === 'mismatch' ? 'danger' : 'warn';
  setMessage($('transaction-status'), `${status.toUpperCase()}: ${last.message || 'Check transaction before doing anything else.'}`, level);
  const evidence = $('evidence'); evidence.replaceChildren();
  if (last.hash) {
    const item = document.createElement('div'); item.className = 'evidence-item';
    const label = document.createElement('span'); label.textContent = 'Transaction hash';
    const value = document.createElement('code'); value.textContent = last.hash;
    const copy = document.createElement('button'); copy.className = 'button subtle'; copy.textContent = 'Copy'; copy.onclick = () => navigator.clipboard.writeText(last.hash);
    item.append(label, value, copy); evidence.append(item);
  }
  if (isUnresolved(last) && !last.hash) {
    const help = document.createElement('p'); help.className = 'small-note';
    help.textContent = 'Wallet request may have been broadcast without a returned hash. Check MetaMask Activity first; never resend blindly. If you find the exact transaction hash, paste it below.';
    evidence.append(help);
  }
  if (last.payer) {
    const p = document.createElement('p'); p.className = 'small-note'; p.textContent = `Payer ${shorten(last.payer)} · ${last.items?.length || 0} expected invoice(s)`;
    evidence.append(p);
  }
  if (last.checkedAt) {
    const checked = document.createElement('p'); checked.className = 'small-note';
    const time = new Date(last.checkedAt);
    if (Number.isFinite(time.getTime())) {
      checked.textContent = `Last checked on this device: ${time.toLocaleString()}. This check is read-only.`;
      evidence.append(checked);
    }
  }
}
async function loadBalances(snapshot = session, version = sessionVersion) {
  if (!snapshot) throw new Error('No wallet connected.');
  const data = await readWallet(snapshot.address);
  // A slow RPC response must never restore balances from an old account.
  if (session !== snapshot || sessionVersion !== version) throw new Error('Wallet changed while reading balances.');
  tokenBalance = data.balance ?? 0n;
  allowance = data.allowance ?? 0n;
  $('balance').textContent = data.configured ? `${amountText(tokenBalance)} pUSD` : 'Unconfigured';
  $('allowance').textContent = data.configured ? `${amountText(allowance)} pUSD` : 'Unconfigured';
  buttons();
  return data;
}

// Listen ONLY to the chosen wallet; another installed wallet must not
// invalidate Setlora's current account when its own account changes.
function onAccountsChanged(accounts) {
  if (connecting && !session && accounts?.length) return;
  resetWalletState('Wallet account changed. Reconnect before paying.', 'warn', true);
  $('connect').textContent = 'Reconnect wallet';
}
function onChainChanged() {
  if (connecting && !session) return;
  resetWalletState('Wallet network changed. Reconnect before paying.', 'warn', true);
  $('connect').textContent = 'Reconnect wallet';
}
function onProviderDisconnect() {
  resetWalletState('Wallet disconnected. Reconnect before paying.', 'warn', true);
  $('connect').textContent = 'Reconnect wallet';
}
function unlistenWallet() {
  if (!connectedProvider) return;
  const remove = connectedProvider.removeListener || connectedProvider.off;
  if (typeof remove === 'function') {
    remove.call(connectedProvider, 'accountsChanged', onAccountsChanged);
    remove.call(connectedProvider, 'chainChanged', onChainChanged);
    remove.call(connectedProvider, 'disconnect', onProviderDisconnect);
  }
  connectedProvider = null;
}
function listenWallet(provider) {
  unlistenWallet();
  connectedProvider = provider;
  if (typeof provider.on === 'function') {
    provider.on('accountsChanged', onAccountsChanged);
    provider.on('chainChanged', onChainChanged);
    provider.on('disconnect', onProviderDisconnect);
  }
}
function renderWalletChoices() {
  const list = $('wallet-choices');
  list.replaceChildren();
  const choices = walletChoices();
  if (!choices.length) {
    const text = document.createElement('p');
    text.className = 'wallet-empty';
    text.textContent = 'No EVM wallet detected. Install a browser wallet to connect.';
    list.append(text);
    return;
  }
  for (const wallet of choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wallet-choice';
    // Wallet names are untrusted extension metadata: never insert as HTML.
    button.textContent = wallet.name;
    button.addEventListener('click', () => {
      $('wallet-picker').close();
      return connectClick(wallet);
    });
    list.append(button);
  }
}
function showWalletPicker() {
  if (busy) return;
  requestWalletDiscovery();
  renderWalletChoices();
  if (!$('wallet-picker').open) $('wallet-picker').showModal();
}

async function connectClick(choice, { selectAccount = false, previousAddress = null } = {}) {
  if (busy) return;
  resetWalletState('Confirm your wallet connection if prompted.');
  // Respond immediately; wallet permission prompts and testnet RPC reads may take time.
  // This is a visual loading state, NOT an indication that payments are enabled.
  $('connect').textContent = 'Connecting…';
  const version = sessionVersion;
  connecting = true;
  setBusy(true);
  try {
    listenWallet(choice.provider);
    // Only a direct Switch account click requests a new account selection.
    // Selecting a wallet provider normally does not re-prompt permissions.
    if (selectAccount) await requestAccountReselection(choice.provider);
    const next = await connect(choice.provider);
    // MetaMask may emit a chain/account event while a connection prompt opens.
    // Verify CURRENT permissions and chain before accepting its result.
    if (sessionVersion !== version) return;
    setMessage($('network-status'), 'Checking wallet and network…');
    await assertActiveWallet(next.wallet, next.address, next.provider);
    if (sessionVersion !== version) return;
    session = next;
    connectedChoice = choice;
    setMessage($('network-status'), 'Loading your pUSD balance…');
    const status = await loadBalances(next, version);
    await assertActiveWallet(next.wallet, next.address, next.provider);
    if (sessionVersion !== version || session !== next) return;
    sessionReady = Boolean(status.configured);
    if (sessionReady) rememberWallet(localStorage, choice, next.address, CHAIN_ID, CONTRACT_ADDRESS);
    restoreDraftForWallet();
    showConnectedWallet(next.address);
    if (ownsSavedTransaction() && last?.status === 'confirmed') {
      addVerifiedHistory(localStorage, CHAIN_ID, CONTRACT_ADDRESS, next.address, last);
    }
    updateTxBox(); renderHistory();
    if (status.configured && selectAccount && previousAddress?.toLowerCase() === next.address.toLowerCase()) {
      setMessage($('network-status'), `Still using ${shorten(next.address)}. Select a different account in your wallet to change it.`, 'warn');
    } else if (status.configured) setMessage($('network-status'), `Connected ${shorten(next.address)} · Portaldot V3 · contract ${shorten(CONTRACT_ADDRESS)}`, 'good');
    else setMessage($('network-status'), 'Contract not configured. Payment actions are disabled.', 'warn');
    setMessage($('review-status'), 'Wallet connected. Review invoices again to verify payment readiness.');
    if (ownsSavedTransaction() && last?.hash) await checkTxClick();
  } catch (error) {
    if (sessionVersion === version) {
      resetWalletState('Connection unsuccessful. No payment can be submitted.', 'warn');
      showError(error, $('network-status'));
    }
  } finally {
    connecting = false;
    // Never leave the button stuck showing a loading label after cancellation.
    if (!$('connect').hidden && $('connect').textContent === 'Connecting…') {
      $('connect').textContent = 'Connect wallet';
    }
    setBusy(false);
  }
}
async function switchAccountClick() {
  if (busy) return;
  // Keep the same provider (MetaMask, Rabby, etc.) but ask it to reselect an account.
  // Never sign or switch accounts by guessing an address; the wallet authorizes it.
  const choice = connectedChoice;
  const previousAddress = session?.address;
  if (!choice) {
    setMessage($('network-status'), 'Choose an account in your wallet, then reconnect.', 'muted');
    showWalletPicker();
    return;
  }
  await connectClick(choice, { selectAccount: true, previousAddress });
}
function changeWalletClick() {
  if (busy) return;
  resetWalletState('Choose a different wallet to connect.', 'muted', true);
  $('connect').textContent = 'Reconnect wallet';
  showWalletPicker();
}
async function reviewClick() {
  renderRecipientChecks(null);
  setBusy(true);
  try {
    const batch = validateInvoices(rows, ethers.isAddress);
    if (!session) {
      review = null;
      renderReviewItems(batch);
      setMessage($('review-status'), 'Invoice preview is valid. Choose a wallet to check the payment on-chain.', 'warn');
      if (!connecting && !attemptingRestore) showWalletPicker();
      return;
    }
    if (!sessionReady) {
      review = null;
      renderReviewItems(batch);
      setMessage($('review-status'), 'Wallet connection is not ready. Check the network status before paying.', 'warn');
      return;
    }
    if (isUnresolved(last)) throw new Error('The last settlement is unresolved or mismatched. Recheck its transaction evidence before making another payment.');
    if (!batchRead) { review = null; renderReviewItems(batch); setMessage($('review-status'), 'Invoice values are valid, but the Setlora contract is not deployed/configured. PREVIEW ONLY — no settlement possible.', 'warn'); return; }
    const snapshot = session, version = sessionVersion;
    const data = await loadBalances(snapshot, version);
    assertSession(snapshot, version);
    if (!data.configured) throw new Error('Contract is not configured.');
    const already = await checkAlreadySettled(snapshot.address, batch.items);
    assertSession(snapshot, version);
    if (already.length) throw new Error(`Already settled for this payer: invoice ${already.join(', ')}. No payment submitted.`);
    setMessage($('review-status'), 'Checking whether each recipient can receive pUSD…');
    const readiness = await preflightRecipients(snapshot.address, batch.items);
    assertSession(snapshot, version);
    renderRecipientChecks(readiness);
    if (!readiness.ready) {
      review = null;
      renderReviewItems(batch);
      setMessage($('review-status'), `Payment not ready: ${readiness.checks.filter(c=>c.status==='blocked').length} recipient(s) need attention. No approval or payment requested.`, 'warn');
      return;
    }
    review = batch;
    renderReviewItems(batch);
    if (tokenBalance < batch.total) {
      setMessage($('review-status'), `Ready for review, but pUSD balance is insufficient: need ${amountText(batch.total)}, have ${amountText(tokenBalance)}. No wallet action is available.`, 'warn');
    } else if (allowance < batch.total) {
      setMessage($('review-status'), `Verified invoices are unpaid for this wallet. Approve exactly ${amountText(batch.total)} pUSD, then review and settle.`, 'good');
    } else setMessage($('review-status'), `Ready for explicit settlement approval: ${batch.items.length} invoices, ${amountText(batch.total)} pUSD.`, 'good');
  } catch (e) { review = null; if (session) showError(e); }
  finally { setBusy(false); }
}
async function approveClick() {
  if (!review || !session || !sessionReady || busy || isUnresolved(last)) return;
  const snapshot = session, version = sessionVersion, batch = review;
  setBusy(true);
  try {
    await assertActiveWallet(snapshot.wallet, snapshot.address, snapshot.provider);
    assertSession(snapshot, version);
    if (await checkAlreadySettled(snapshot.address, batch.items).then(x => x.length)) throw new Error('One or more invoices are already settled; review again.');
    assertSession(snapshot, version);
    const readiness = await preflightRecipients(snapshot.address, batch.items);
    assertSession(snapshot, version);
    renderRecipientChecks(readiness);
    if (!readiness.ready) throw new Error('A recipient is not ready to receive pUSD. Resolve the issue and review the batch again. No approval submitted.');
    await assertActiveWallet(snapshot.wallet, snapshot.address, snapshot.provider);
    assertSession(snapshot, version);
    const tx = await approveExactAmount(snapshot.wallet, batch.total, snapshot.address, snapshot.provider);
    if (activeSession(snapshot, version)) setMessage($('review-status'), `Approval submitted: ${tx.hash}. Check wallet activity before any retry.`, 'warn');
    const receipt = await tx.wait(1);
    if (!receipt || receipt.status !== 1) throw new Error('Approval did not receive a successful receipt.');
    if (!activeSession(snapshot, version)) return;
    await loadBalances(snapshot, version);
    if (activeSession(snapshot, version)) setMessage($('review-status'), 'Approval confirmed. Settlement still requires a separate wallet confirmation.', 'good');
  } catch (e) {
    // Don't overwrite the disconnected or newly connected account's status.
    if (activeSession(snapshot, version)) { review = null; showError(e); }
  } finally { setBusy(false); }
}
async function settleClick() {
  if (!review || !session || !sessionReady || busy || isUnresolved(last)) return;
  const snapshot = session, version = sessionVersion, batch = review;
  setBusy(true);
  let hash = null;
  let openedWallet = false;
  const previousRecord = last;
  try {
    await assertActiveWallet(snapshot.wallet, snapshot.address, snapshot.provider);
    assertSession(snapshot, version);
    await loadBalances(snapshot, version);
    assertSession(snapshot, version);
    if (tokenBalance < batch.total || allowance < batch.total) throw new Error('Insufficient balance or allowance. Review again.');
    const already = await checkAlreadySettled(snapshot.address, batch.items);
    assertSession(snapshot, version);
    if (already.length) throw new Error(`Already settled: ${already.join(', ')}. Do not retry.`);
    // Recheck recipient eligibility and the atomic delegated path immediately
    // before the wallet is asked to sign. Both checks are read-only.
    const readiness = await preflightRecipients(snapshot.address, batch.items);
    assertSession(snapshot, version);
    renderRecipientChecks(readiness);
    if (!readiness.ready) throw new Error('A recipient is no longer ready. Review the affected recipient before settlement.');
    await preflightWholeBatch(snapshot.address, batch.items);
    assertSession(snapshot, version);
    await assertActiveWallet(snapshot.wallet, snapshot.address, snapshot.provider);
    assertSession(snapshot, version);

    // Persist BEFORE asking MetaMask to sign. A reload or provider failure must
    // not erase evidence of a possibly broadcast financial operation.
    const attempt = {
      hash: null, chainId: String(CHAIN_ID), contract: CONTRACT_ADDRESS, payer: snapshot.address,
      items: batch.items.map(x => ({ invoice: String(x.invoice), recipient: x.recipient, amount: String(x.amount) })),
      status: 'signing', message: 'Wallet confirmation requested. If the page closes, check wallet activity before retrying.'
    };
    saveTx(attempt);
    openedWallet = true;
    const tx = await sendBatch(snapshot.wallet, batch.items, snapshot.address, snapshot.provider);
    hash = tx.hash;
    saveTx({ ...attempt, hash, status: 'unknown', message: 'Broadcast submitted. Verify receipt before any retry.' });
    await checkTxClick();
  } catch (e) {
    if (!openedWallet || (openedWallet && !hash && isWalletRejection(e))) {
      // The request never reached the wallet, or was explicitly rejected.
      // Retain any previous record rather than inventing a pending payment.
      saveTx(previousRecord);
      if (activeSession(snapshot, version)) {
        review = null;
        setMessage($('transaction-status'), `No settlement broadcast was confirmed: ${e.shortMessage || e.message}.`, 'warn');
        setMessage($('review-status'), `Settlement precheck did not complete: ${e.shortMessage || e.message}. Review the batch again.`, 'warn');
      }
    } else {
      // With an ambiguous outcome, NEVER silently unlock another payment.
      saveTx({ ...last, hash: hash || last?.hash || null, status: 'unknown',
        message: `Transaction status uncertain: ${e.shortMessage || e.message}. Reconcile wallet activity and chain evidence before any retry.` });
    }
  } finally { setBusy(false); }
}
async function checkTxClick() {
  last = last || savedTx();
  if (!last?.hash || !ownsSavedTransaction()) return;
  const record = last;
  try {
    if (!last.payer || !last.items?.length) throw new Error('Missing verification snapshot; inspect transaction manually.');
    if ((last.chainId && last.chainId !== String(CHAIN_ID)) || (last.contract && last.contract.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase())) throw new Error('Saved transaction was created for a different chain or contract.');
    const items = last.items.map(x=>({invoice:BigInt(x.invoice),recipient:x.recipient,amount:BigInt(x.amount)}));
    const result = await verifySettlement(last.hash, last.payer, items, session?.provider);
    if (last !== record) return; // An intervening operation replaced this record.
    saveTx({...record, status:result.status, message:result.reason, checkedAt:new Date().toISOString()});
    if (session && result.status === 'confirmed' && ownsSavedTransaction()) {
      const snapshot = session, version = sessionVersion;
      review = null; renderReviewItems(null);
      try { await loadBalances(snapshot, version); } catch { /* Account changed; balances stay cleared. */ }
    }
  } catch (e) {
    if (last === record) saveTx({...record, status:'unknown', message:`Verification unavailable: ${e.shortMessage || e.message}. Do not resend blindly.`, checkedAt:new Date().toISOString()});
  }
}

// Recover only a wallet that this browser previously connected explicitly.
// No permission request, network switch, token approval, or signing on reload.
async function tryRestoreWallet() {
  if (busy || connecting || attemptingRestore || session || $('wallet-picker').open) return;
  const remembered = rememberedWallet(localStorage, CHAIN_ID, CONTRACT_ADDRESS);
  if (!remembered) return;
  const choice = findWalletChoice(walletChoices(), remembered);
  if (!choice) return; // Ambiguous/missing wallet: let the user select it.
  attemptingRestore = true;
  connecting = true;
  const version = sessionVersion;
  $('connect').textContent = 'Restoring wallet…';
  setMessage($('network-status'), 'Checking your previously connected wallet…');
  setBusy(true);
  try {
    if (!(await isWalletStillAuthorized(choice.provider, remembered, CHAIN_ID))) {
      // The user changed account, revoked access, or switched network.
      forgetWallet(localStorage);
      setMessage($('network-status'), 'Wallet access or network changed. Connect a wallet to continue.', 'muted');
      return;
    }
    if (sessionVersion !== version) return;
    const next = { wallet: new ethers.BrowserProvider(choice.provider, 'any'), provider: choice.provider, address: remembered.address };
    listenWallet(choice.provider);
    session = next;
    connectedChoice = choice;
    const status = await loadBalances(next, version);
    if (sessionVersion !== version || session !== next) return;
    if (!(await isWalletStillAuthorized(choice.provider, remembered, CHAIN_ID))) {
      resetWalletState('Wallet access changed. Connect again to continue.', 'warn', true);
      return;
    }
    if (sessionVersion !== version || session !== next) return;
    sessionReady = Boolean(status.configured);
    restoreDraftForWallet();
    showConnectedWallet(next.address);
    if (ownsSavedTransaction() && last?.status === 'confirmed') {
      addVerifiedHistory(localStorage, CHAIN_ID, CONTRACT_ADDRESS, next.address, last);
    }
    updateTxBox(); renderHistory();
    if (status.configured) {
      setMessage($('network-status'), `Connected ${shorten(next.address)} · Portaldot V3 · contract ${shorten(CONTRACT_ADDRESS)}`, 'good');
    } else {
      forgetWallet(localStorage);
      setMessage($('network-status'), 'Contract configuration needs attention. Payment actions are disabled.', 'warn');
    }
    setMessage($('review-status'), 'Wallet restored. Review your invoices again before approving or settling.');
    // Receipt recovery uses read-only RPC queries and never authorizes payment.
    if (ownsSavedTransaction() && last?.hash) await checkTxClick();
  } catch {
    if (sessionVersion === version) resetWalletState('Could not restore your wallet. Choose Connect wallet to try again.', 'warn');
  } finally {
    connecting = false;
    attemptingRestore = false;
    if (!$('connect').hidden && $('connect').textContent === 'Restoring wallet…') $('connect').textContent = 'Connect wallet';
    setBusy(false);
  }
}
$('connect').addEventListener('click', showWalletPicker);
$('close-wallet-picker').addEventListener('click', () => $('wallet-picker').close());
startWalletDiscovery(() => {
  if ($('wallet-picker').open) renderWalletChoices();
  void tryRestoreWallet();
});
// Also cover wallets that expose only window.ethereum instead of EIP-6963.
void tryRestoreWallet();
// A deliberate disconnect also requests revocation of this origin's MetaMask
// eth_accounts permission. Local app state is invalidated FIRST, so pending
// balance responses or future clicks cannot revive an old wallet session.
async function disconnectWalletClick() {
  if (busy) return;
  const provider = session?.provider;
  resetWalletState('Disconnecting wallet…', 'muted', true);
  $('connect').textContent = 'Reconnect wallet';
  setBusy(true);
  try {
    if (!provider?.request) throw new Error('The selected wallet is unavailable.');
    await provider.request({
      method: 'wallet_revokePermissions',
      params: [{ eth_accounts: {} }]
    });
    // A successful RPC response alone is not sufficient to promise that this
    // site no longer has access; check the actual authorized account list.
    let accounts;
    try {
      accounts = await provider.request({ method: 'eth_accounts', params: [] });
    } catch (error) {
      if (error?.code === 4100) accounts = [];
      else throw new Error('The wallet responded to revocation, but account access could not be verified.');
    }
    if (Array.isArray(accounts) && accounts.length === 0) {
      setMessage($('network-status'),
        'Wallet disconnected.', 'good');
    } else {
      setMessage($('network-status'),
        'Wallet disconnected. You can remove site access in your wallet settings.', 'warn');
    }
  } catch (error) {
    // Do not claim successful revocation if a wallet lacks the method,
    // rejects the request, or fails to respond. The local logout still works.
    setMessage($('network-status'),
      'Wallet disconnected. You can remove site access in your wallet settings.', 'warn');
  } finally {
    $('connect').textContent = 'Reconnect wallet';
    setBusy(false);
  }
}
$('disconnect-wallet').addEventListener('click', disconnectWalletClick);
$('switch-wallet').addEventListener('click', switchAccountClick);
$('change-wallet').addEventListener('click', changeWalletClick);
$('copy-wallet').addEventListener('click', async () => {
  if (!session || busy) return;
  try {
    await navigator.clipboard.writeText(session.address);
    setMessage($('network-status'), `Copied wallet address ${shorten(session.address)}.`, 'good');
  } catch (e) { showError(e, $('network-status')); }
  $('wallet-menu').open = false;
});
$('download-template').addEventListener('click', () => {
  const csv = 'invoice,recipient,amount,note\n1,0xREPLACE_WITH_RECIPIENT,1.00,Optional note\n';
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'setlora-invoices-template.csv'; document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});
$('history-export').addEventListener('click', exportHistoryReceipt);
$('export-receipt').addEventListener('click', () => {
  try {
    const receipt = makeVerifiedReceipt(last, CHAIN_ID, CONTRACT_ADDRESS);
    const url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `setlora-receipt-${last.hash.slice(2,10)}.json`; document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  } catch (e) { showError(e, $('transaction-status')); }
});
const draftDialog = $('clear-draft-dialog');
$('clear-draft').addEventListener('click', () => {
  if (busy || draftDialog.open) return;
  draftDialog.showModal();
});
$('cancel-clear-draft').addEventListener('click', () => draftDialog.close('cancel'));
$('confirm-clear-draft').addEventListener('click', () => {
  if (busy) return;
  draftDialog.close('confirmed');
  const key = currentDraftKey();
  if (key) { try { localStorage.removeItem(key); } catch { /* No write access */ } }
  rows = [{ ...EMPTY_ROW }]; renderRows(); resetReview();
  draftStatus(key ? 'Draft cleared from this browser.' : 'Entries cleared. Connect to save drafts.');
  $('clear-draft').focus();
});
$('add').addEventListener('click', () => { if (rows.length < MAX_INVOICES) { rows.push({ ...EMPTY_ROW }); renderRows(); resetReview(); persistDraft(); } });
$('csvfile').addEventListener('change', async e => {
  try { const file=e.target.files?.[0]; if (!file) return; if (file.size > 150000) throw new Error('CSV must be smaller than 150 KB');
    rows = parseCsv(await file.text()); renderRows(); resetReview(); persistDraft(); }
  catch(err) { showError(err); } finally { e.target.value=''; }
});
$('review').addEventListener('click', reviewClick);
$('approve').addEventListener('click', approveClick);
$('settle').addEventListener('click', settleClick);
$('check-tx').addEventListener('click', checkTxClick);
$('manual-hash').addEventListener('input', buttons);
$('restore-hash').addEventListener('click', async () => {
  if (busy || !session || !sessionReady) return;
  const hash = $('manual-hash').value.trim();
  const action = recoveryActionState({
    inputHash: hash,
    record: last,
    ownsRecord: ownsSavedTransaction(),
    connected: Boolean(sessionReady && session),
    busy,
    unresolved: isUnresolved(last)
  });
  if (action.disabled) return;
  const snapshot = session, version = sessionVersion;
  // The exact same confirmed hash is already attached. Recheck its existing
  // snapshot rather than trying to import or broadcast it again.
  if (action.mode === 'recheck') {
    setBusy(true);
    try { await checkTxClick(); }
    finally { setBusy(false); }
    return;
  }
  const hashlessPending = action.mode === 'attach';
  setBusy(true);
  try {
    let recovered;
    if (hashlessPending) recovered = attachRecoveredHash(last, hash);
    else recovered = await recoverHistoricalSettlement(hash, snapshot.address, snapshot.provider);
    assertSession(snapshot, version);
    saveTx(recovered);
    $('manual-hash').value = '';
    await checkTxClick();
  } catch (e) {
    if (activeSession(snapshot, version)) showError(e, $('transaction-status'));
  } finally { setBusy(false); }
});

last=savedTx(); renderRows(); renderHistory(); draftStatus('Connect wallet to restore saved drafts.'); renderReviewItems(null); updateTxBox(); buttons();
if (!CONTRACT_ADDRESS) setMessage($('network-status'),'PREVIEW MODE — Setlora contract address has not been configured. No transactions can be signed.', 'warn');
else if (!ethers.isAddress(CONTRACT_ADDRESS)) setMessage($('network-status'),'Invalid contract address in environment configuration. Settlement disabled.', 'danger');
else setMessage($('network-status'),`Contract configured: ${shorten(CONTRACT_ADDRESS)}. Connect a wallet to verify it on Portaldot V3.`, 'muted');
