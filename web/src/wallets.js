// Discover browser-injected EVM wallets using the EIP-6963 standard.
// Do not trust a wallet's self-reported name as proof of identity.
const announced = new Map();
let callback = null;
let initialized = false;

function announcement(event) {
  const detail = event?.detail;
  if (!detail?.provider || typeof detail.provider.request !== 'function') return;
  if (typeof detail.info?.uuid !== 'string' || typeof detail.info?.name !== 'string') return;
  const key = detail.info.uuid.slice(0, 100);
  if (!key) return;
  announced.set(key, { id: key, name: detail.info.name.slice(0, 70), rdns: typeof detail.info.rdns === 'string' ? detail.info.rdns.slice(0, 120) : '', provider: detail.provider });
  callback?.();
}

export function startWalletDiscovery(onChange) {
  callback = onChange;
  if (!initialized) {
    window.addEventListener('eip6963:announceProvider', announcement);
    initialized = true;
  }
  requestWalletDiscovery();
}

export function requestWalletDiscovery() {
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

export function walletChoices() {
  const available = [...announced.values()];
  // Legacy fallback: only if no EIP-6963 wallets announced. Avoid listing
  // window.ethereum as an extra, ambiguous wallet when several are installed.
  if (!available.length && window.ethereum?.request) {
    available.push({ id: 'legacy', name: window.ethereum.isMetaMask ? 'MetaMask (browser)' : 'Browser wallet', rdns: '', provider: window.ethereum });
  }
  return available;
}
