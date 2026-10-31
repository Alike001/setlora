import { ethers } from 'ethers';
import { verifyPublicPayment } from './public-proof.js';
const EXAMPLE_HASH = '0x0ea4730fc73f3842a80f3015ee682ffa2bc0c5312fccf272d9899ee3ec1e3c16';
const $ = id => document.getElementById(id);
const form = $('proof-form');
const input = $('tx-hash');
const status = $('proof-status');
const result = $('proof-result');
const submit = $('verify-btn');
const example = $('example-btn');
const copy = $('copy-proof');
let latestVerifiedHash = null;

function setStatus(message, kind = '') {
  status.className = 'notice ' + kind;
  status.textContent = message;
}
function clearResult() {
  result.hidden = true;
  latestVerifiedHash = null;
}
function showProof(proof) {
  $('proof-payer').textContent = proof.payer;
  $('proof-contract').textContent = proof.contract;
  $('proof-block').textContent = String(proof.blockNumber);
  $('proof-total').textContent = ethers.formatUnits(proof.total, 6) + ' pUSD';
  $('result-state').textContent = proof.status === 'confirmed' ? 'Verified' : 'Not verified';
  $('result-state').className = proof.status === 'confirmed' ? 'success-pill' : 'warning-pill';
  $('proof-detail').textContent = proof.reason;
  $('proof-detail').className = proof.status === 'confirmed' ? 'notice success' : 'notice warn';
  const list = $('proof-items');
  list.replaceChildren();
  for (const item of proof.items) {
    const row = document.createElement('div'); row.className = 'item';
    const info = document.createElement('div');
    const id = document.createElement('strong'); id.textContent = 'Invoice #' + item.invoice;
    const addr = document.createElement('code'); addr.textContent = item.recipient;
    info.append(id, addr);
    const amount = document.createElement('strong'); amount.textContent = ethers.formatUnits(item.amount, 6) + ' pUSD';
    row.append(info, amount); list.append(row);
  }
  latestVerifiedHash = proof.status === 'confirmed' ? proof.hash : null;
  copy.disabled = !latestVerifiedHash;
  result.hidden = false;
}
async function runCheck() {
  clearResult();
  submit.disabled = true; example.disabled = true;
  setStatus('Reading Portaldot testnet receipt, events, block and settlement flags…');
  try {
    const proof = await verifyPublicPayment(input.value);
    showProof(proof);
    setStatus(proof.status === 'confirmed'
      ? 'Verified from live chain evidence. No wallet or signature was needed.'
      : 'Unable to verify this payment fully. Do not treat it as confirmed.',
      proof.status === 'confirmed' ? 'success' : 'warn');
  } catch (e) {
    setStatus((e?.message || 'Verification could not be completed.') + ' No wallet action was made.', 'warn');
  } finally { submit.disabled = false; example.disabled = false; }
}
form.addEventListener('submit', e => { e.preventDefault(); runCheck(); });
example.addEventListener('click', () => { input.value = EXAMPLE_HASH; runCheck(); });
copy.addEventListener('click', async () => {
  if (!latestVerifiedHash) return;
  const url = new URL('/proof.html', window.location.origin);
  url.searchParams.set('tx', latestVerifiedHash);
  try { await navigator.clipboard.writeText(url.href); copy.textContent = 'Link copied'; }
  catch { copy.textContent = 'Copy unavailable'; }
});
const queryHash = new URLSearchParams(window.location.search).get('tx');
if (queryHash && queryHash.length <= 66) { input.value = queryHash; runCheck(); }
