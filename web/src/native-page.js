import { formatAssetUnits } from './native-account.js';
const $ = id => document.getElementById(id);
const status = $('lookup-status');
const form = $('native-form');
const input = $('recipient');
const button = $('check');
const results = $('lookup-results');
const grid = $('account-data');
// Prefill an address from the payment workspace; never auto-run a query.
const linkedAddress = new URLSearchParams(window.location.search).get('address');
if (linkedAddress && linkedAddress.length <= 128) {
  input.value = linkedAddress;
}

function addDetail(label, value) {
  const outer = document.createElement('div');
  const heading = document.createElement('span');
  const content = document.createElement('strong');
  outer.className = 'detail';
  heading.textContent = label;
  content.textContent = String(value ?? 'Unknown');
  outer.append(heading, content);
  grid.append(outer);
}
function show(data) {
  grid.replaceChildren();
  $('lookup-result-title').textContent = data.assessment.label;
  addDetail('Native account', data.address);
  addDetail('Address type', data.kind);
  if (data.evm) addDetail('Related EVM address (derived)', data.evm);
  addDetail('Native free balance (base units)', data.system.free);
  addDetail('System providers / sufficients', `${data.system.providers} / ${data.system.sufficients}`);
  addDetail('pUSD asset account', data.asset ? 'Exists' : 'Not found');
  if (data.asset) {
    addDetail('pUSD balance', `${formatAssetUnits(data.asset.balance, data.metadata.decimals)} pUSD`);
    addDetail('Asset-account state', data.asset.status);
    addDetail('Asset-account reason', data.asset.reason);
  }
  addDetail('Asset minimum', `${formatAssetUnits(data.details?.minBalance ?? 0, data.metadata.decimals)} pUSD`);
  addDetail('Asset sufficient?', data.details?.isSufficient ? 'Yes' : 'No');
  addDetail('Network', data.network);
  addDetail('Latest observed block', data.block);
  addDetail('Read at', new Date(data.checkedAt).toLocaleString());
  $('lookup-assessment').textContent = data.assessment.help;
  $('lookup-assessment').className = `notice ${data.assessment.kind === 'existing' ? 'success' : data.assessment.kind === 'blocked' ? 'error' : ''}`;
  results.hidden = false;
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  status.className = 'notice';
  status.textContent = 'Reading live Portaldot account and asset storage…';
  results.hidden = true;
  try {
    // Loads the Substrate SDK only after the user chooses to run a read-only lookup.
    const { queryNativeRecipient } = await import('./native-rpc.js');
    const result = await queryNativeRecipient(input.value);
    show(result);
    status.textContent = `Lookup complete for asset 7777. No wallet signature or transaction was requested.`;
  } catch (error) {
    status.className = 'notice error';
    status.textContent = `${error?.message || 'Account lookup failed.'} No changes were made.`;
  } finally { button.disabled = false; }
});
document.querySelectorAll('[data-address]').forEach(el => el.addEventListener('click', () => {
  input.value = el.dataset.address;
  input.focus();
}));
