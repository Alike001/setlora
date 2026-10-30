import './styles.css';
import { ethers } from 'ethers';
import { TOKEN, RPC, CONTRACT_ADDRESS, CHAIN_ID } from './config.js';
import { validateInvoices, MAX_INVOICES, parseUnitsExact } from './invoice.js';
import { parseCsv } from './csv.js';
import { connect, read, batchRead, readWallet, checkAlreadySettled, approveExactAmount, sendBatch, verifySettlement } from './chain.js';

const $ = id => document.getElementById(id);
let rows = [{ invoice: '', recipient: '', amount: '', note: '' }];
let session = null;
let review = null;
let allowance = 0n;
let tokenBalance = 0n;
let busy = false;
let last = null;
const STORAGE_KEY = 'setlora:pending:v1';

function shorten(s) { return s ? `${s.slice(0, 6)}…${s.slice(-4)}` : '—'; }
function amountText(amount) { return ethers.formatUnits(amount, 6); }
function setMessage(el, message, level = 'muted') { el.className = `message ${level}`; el.textContent = message; }
function buttons() {
  $('add').disabled = busy || rows.length >= MAX_INVOICES;
  $('review').disabled = busy;
  $('approve').disabled = busy || !review || !session || allowance >= review.total || tokenBalance < review.total;
  $('settle').disabled = busy || !review || !session || allowance < review.total || tokenBalance < review.total || !!(last && last.status === 'unknown');
  $('check-tx').disabled = busy || !last?.hash;
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
  setMessage($('review-status'), 'Invoice details changed. Review this batch again before approval or settlement.');
  updateSummary(); buttons();
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
      input.addEventListener('input', () => { rows[idx][key] = input.value; resetReview(); });
      td.append(input); tr.append(td);
    }
    const del = document.createElement('td');
    const button = document.createElement('button'); button.type = 'button'; button.className = 'delete'; button.textContent = '×';
    button.setAttribute('aria-label', `Remove invoice ${idx + 1}`); button.disabled = busy;
    button.addEventListener('click', () => { rows.splice(idx, 1); if (!rows.length) rows.push({invoice:'',recipient:'',amount:'',note:''}); renderRows(); resetReview(); });
    del.append(button); tr.append(del); tbody.append(tr);
  });
  updateSummary(); buttons();
}
function setBusy(value) { busy = value; buttons(); }
function showError(e, el = $('review-status')) {
  const message = e?.shortMessage || e?.reason || e?.message || String(e);
  setMessage(el, message, 'danger');
}
function savedTx() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
  catch { return null; }
}
function saveTx(record) {
  last = record;
  if (record) localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  else localStorage.removeItem(STORAGE_KEY);
  updateTxBox(); buttons();
}
function updateTxBox() {
  if (!last) { setMessage($('transaction-status'), 'No transaction submitted from this browser yet.'); $('evidence').replaceChildren(); return; }
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
  if (last.payer) {
    const p = document.createElement('p'); p.className = 'small-note'; p.textContent = `Payer ${shorten(last.payer)} · ${last.items?.length || 0} expected invoice(s)`;
    evidence.append(p);
  }
}
async function loadBalances() {
  if (!session) return;
  const data = await readWallet(session.address);
  tokenBalance = data.balance ?? 0n; allowance = data.allowance ?? 0n;
  $('balance').textContent = data.configured ? `${amountText(tokenBalance)} pUSD` : 'Unconfigured';
  $('allowance').textContent = data.configured ? `${amountText(allowance)} pUSD` : 'Unconfigured';
  buttons();
  return data;
}
async function connectClick() {
  setBusy(true);
  try {
    session = await connect();
    $('connect').textContent = shorten(session.address);
    review = null;
    const status = await loadBalances();
    if (status.configured) setMessage($('network-status'), `Connected ${shorten(session.address)} · Portaldot V3 · contract ${shorten(CONTRACT_ADDRESS)}`, 'good');
    else setMessage($('network-status'), `Connected ${shorten(session.address)} · Portaldot V3. No contract address configured: PREVIEW ONLY.`, 'warn');
    setMessage($('review-status'), 'Wallet connected. Review the invoices to check payment readiness.');
    if (last?.hash) await checkTxClick();
  } catch (error) { showError(error, $('network-status')); }
  finally { setBusy(false); }
}
async function reviewClick() {
  setBusy(true);
  try {
    const batch = validateInvoices(rows, ethers.isAddress);
    if (!session) { review = null; setMessage($('review-status'), `Invoice preview valid: ${batch.items.length} invoice(s), ${amountText(batch.total)} pUSD. Connect MetaMask to verify on-chain status.`, 'warn'); return; }
    if (last?.status === 'unknown') throw new Error('A previously submitted payment is unresolved. Check its transaction hash before preparing another payment.');
    if (!batchRead) { review = null; setMessage($('review-status'), 'Invoice values are valid, but the Setlora contract is not deployed/configured. PREVIEW ONLY — no settlement possible.', 'warn'); return; }
    const data = await loadBalances();
    if (!data.configured) throw new Error('Contract is not configured.');
    const already = await checkAlreadySettled(session.address, batch.items);
    if (already.length) throw new Error(`Already settled for this payer: invoice ${already.join(', ')}. No payment submitted.`);
    review = batch;
    if (tokenBalance < batch.total) {
      setMessage($('review-status'), `Ready for review, but pUSD balance is insufficient: need ${amountText(batch.total)}, have ${amountText(tokenBalance)}. No wallet action is available.`, 'warn');
    } else if (allowance < batch.total) {
      setMessage($('review-status'), `Verified invoices are unpaid for this wallet. Approve exactly ${amountText(batch.total)} pUSD, then review and settle.`, 'good');
    } else setMessage($('review-status'), `Ready for explicit settlement approval: ${batch.items.length} invoices, ${amountText(batch.total)} pUSD.`, 'good');
  } catch (e) { review = null; showError(e); }
  finally { setBusy(false); }
}
async function approveClick() {
  if (!review || !session) return;
  setBusy(true);
  try {
    if (await checkAlreadySettled(session.address, review.items).then(x=>x.length)) throw new Error('One or more invoices are already settled; review again.');
    const tx = await approveExactAmount(session.wallet, review.total);
    setMessage($('review-status'), `Approval submitted: ${tx.hash}. Check wallet activity before any retry.`, 'warn');
    const receipt = await tx.wait(1);
    if (!receipt || receipt.status !== 1) throw new Error('Approval did not receive a successful receipt.');
    await loadBalances();
    setMessage($('review-status'), 'Approval confirmed. Settlement still requires a separate wallet confirmation.', 'good');
  } catch (e) { review = null; showError(e); }
  finally { setBusy(false); }
}
async function settleClick() {
  if (!review || !session) return;
  setBusy(true);
  let hash = null;
  try {
    if (last?.status === 'unknown') throw new Error('Previous transaction unresolved. Do not resend.');
    await loadBalances();
    if (tokenBalance < review.total || allowance < review.total) throw new Error('Insufficient balance or allowance. Review again.');
    const already = await checkAlreadySettled(session.address, review.items);
    if (already.length) throw new Error(`Already settled: ${already.join(', ')}. Do not retry.`);
    const tx = await sendBatch(session.wallet, review.items);
    hash = tx.hash;
    saveTx({hash, payer:session.address, items: review.items.map(x=>({invoice:String(x.invoice),recipient:x.recipient,amount:String(x.amount)})), status:'unknown', message:'Broadcast submitted. Confirm receipt before any retry.'});
    await checkTxClick();
  } catch (e) {
    if (!hash) { review = null; showError(e, $('transaction-status')); }
    else setMessage($('transaction-status'), 'Transaction confirmation uncertain. Use Check last transaction, and do not resubmit.');
  } finally { setBusy(false); }
}
async function checkTxClick() {
  last = last || savedTx();
  if (!last?.hash) return;
  try {
    if (!last.payer || !last.items?.length) throw new Error('Missing verification snapshot; inspect transaction manually.');
    const items = last.items.map(x=>({invoice:BigInt(x.invoice),recipient:x.recipient,amount:BigInt(x.amount)}));
    const result = await verifySettlement(last.hash, last.payer, items);
    saveTx({...last, status:result.status, message:result.reason});
    if (session && result.status === 'confirmed') { review = null; await loadBalances(); }
  } catch (e) {
    saveTx({...last, status:'unknown', message:`Verification unavailable: ${e.shortMessage || e.message}. Do not resend blindly.`});
  }
}

$('connect').addEventListener('click', connectClick);
$('add').addEventListener('click', () => { if (rows.length < MAX_INVOICES) { rows.push({invoice:'',recipient:'',amount:'',note:''}); renderRows(); resetReview(); } });
$('csvfile').addEventListener('change', async e => {
  try { const file=e.target.files?.[0]; if (!file) return; if (file.size > 150000) throw new Error('CSV must be smaller than 150 KB');
    rows = parseCsv(await file.text()); renderRows(); resetReview(); }
  catch(err) { showError(err); } finally { e.target.value=''; }
});
$('review').addEventListener('click', reviewClick);
$('approve').addEventListener('click', approveClick);
$('settle').addEventListener('click', settleClick);
$('check-tx').addEventListener('click', checkTxClick);
if (window.ethereum?.on) {
  window.ethereum.on('accountsChanged', () => { session=null; review=null; $('connect').textContent='Reconnect wallet'; setMessage($('network-status'),'Wallet account changed. Reconnect before paying.','warn'); buttons(); });
  window.ethereum.on('chainChanged', () => { session=null; review=null; $('connect').textContent='Reconnect wallet'; setMessage($('network-status'),'Wallet network changed. Reconnect before paying.','warn'); buttons(); });
}
last=savedTx(); renderRows(); updateTxBox();
if (!CONTRACT_ADDRESS) setMessage($('network-status'),'PREVIEW MODE — Setlora contract address has not been configured. No transactions can be signed.', 'warn');
else if (!ethers.isAddress(CONTRACT_ADDRESS)) setMessage($('network-status'),'Invalid contract address in environment configuration. Settlement disabled.', 'danger');
else setMessage($('network-status'),`Contract configured: ${shorten(CONTRACT_ADDRESS)}. Connect a wallet to verify it on Portaldot V3.`, 'muted');
