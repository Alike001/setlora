// Remember only the wallet selection metadata and public address.
// No private key, approval, or signature is ever stored.
export const WALLET_KEY = 'setlora:last-wallet:v1';
const isAddress = value => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);

export function forgetWallet(storage) {
  try { storage.removeItem(WALLET_KEY); } catch { /* Storage may be disabled. */ }
}
export function rememberWallet(storage, choice, address, chainId, contract) {
  if (!isAddress(address) || !isAddress(contract) || !choice?.name) return false;
  const record = { version: 1, address: address.toLowerCase(), chainId: String(chainId),
    contract: contract.toLowerCase(), name: choice.name, rdns: choice.rdns || '',
    legacy: choice.id === 'legacy' };
  try { storage.setItem(WALLET_KEY, JSON.stringify(record)); return true; }
  catch { return false; }
}
export function rememberedWallet(storage, chainId, contract) {
  try {
    const item = JSON.parse(storage.getItem(WALLET_KEY) || 'null');
    if (!item || item.version !== 1 || !isAddress(item.address) || !isAddress(item.contract) ||
        item.chainId !== String(chainId) || item.contract !== String(contract).toLowerCase() ||
        typeof item.name !== 'string' || !item.name || typeof item.rdns !== 'string' ||
        typeof item.legacy !== 'boolean') return null;
    return item;
  } catch { return null; }
}
export function findWalletChoice(choices, remembered) {
  if (!remembered || !Array.isArray(choices)) return null;
  const matches = choices.filter(choice => {
    if (!choice || !choice.provider?.request || choice.name !== remembered.name) return false;
    if (remembered.legacy) return choice.id === 'legacy';
    return choice.id !== 'legacy' && (choice.rdns || '') === remembered.rdns;
  });
  // Names and rdns are extension-supplied metadata, not security guarantees.
  // Don't silently choose one provider when the match is ambiguous.
  return matches.length === 1 ? matches[0] : null;
}
export async function isWalletStillAuthorized(provider, remembered, chainId) {
  if (!provider?.request || !remembered || !isAddress(remembered.address)) return false;
  // IMPORTANT: eth_accounts does not prompt, unlike eth_requestAccounts.
  try {
    const [accounts, currentChain] = await Promise.all([
      provider.request({ method: 'eth_accounts' }),
      provider.request({ method: 'eth_chainId' })
    ]);
    return Array.isArray(accounts) && accounts.length > 0 && isAddress(accounts[0]) &&
      accounts[0].toLowerCase() === remembered.address && BigInt(currentChain) === BigInt(chainId);
  } catch { return false; }
}

// Prompt the selected injected wallet to let the user choose which account this
// origin may access. Call ONLY in response to a user clicking Switch account.
// A normal eth_requestAccounts call can silently reuse existing permissions.
export async function requestAccountReselection(provider) {
  if (!provider?.request) throw new Error('The selected wallet is unavailable.');
  try {
    await provider.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
  } catch (error) {
    if (error?.code === 4001) throw new Error('Account selection cancelled. Reconnect when ready.');
    if (error?.code === -32601 || error?.code === 4200) {
      throw new Error('This wallet cannot open an account selector. Change the active account inside the wallet extension, then reconnect.');
    }
    throw error;
  }
  // A permission approval is not a payment authorization. Validate its result.
  const accounts = await provider.request({ method: 'eth_accounts' });
  if (!Array.isArray(accounts) || !isAddress(accounts[0])) {
    throw new Error('No wallet account was authorized. Select an account and reconnect.');
  }
  return accounts[0];
}
