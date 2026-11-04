import { BrowserProvider, JsonRpcSigner, getAddress } from 'ethers';

// One observer per injected provider. A response is usable only for its current
// event revision AND the latest read; an older request cannot revive readiness.
const states = new WeakMap();
const wallets = new WeakMap();
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const changed = reason => Object.assign(new Error('Wallet state changed during verification. Reconnect and review again.'), { code: 'WALLET_STATE_CHANGED', reason });

export function walletState(provider) {
  if (!provider?.request) throw new Error('The selected wallet is unavailable.');
  if (states.has(provider)) return states.get(provider);
  let revision = 0, sequence = 0, disposed = false, disconnected = false;
  const pending = new Set(), subscribers = new Set();
  const cancel = reason => {
    for (const reject of pending) reject(changed(reason));
    pending.clear();
  };
  const events = ['accountsChanged', 'chainChanged', 'disconnect'];
  const handlers = events.map(event => value => {
    ++revision; ++sequence;
    if (event === 'disconnect') disconnected = true;
    cancel(disconnected ? 'disconnected' : 'event');
    for (const subscriber of subscribers) subscriber(event, value);
  });
  events.forEach((event, index) => provider.on?.(event, handlers[index]));
  const state = {
    subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
    assertRevision(expected) {
      if (disposed || disconnected || revision !== expected) throw changed(disposed ? 'disposed' : disconnected ? 'disconnected' : 'event');
    },
    async read() {
      if (disposed || disconnected) throw changed(disposed ? 'disposed' : 'disconnected');
      cancel('superseded');
      const request = ++sequence, epoch = revision;
      let rejectRead;
      const invalidated = new Promise((_, reject) => { rejectRead = reject; pending.add(reject); });
      try {
        const [accounts, chain] = await Promise.race([
          Promise.all([
            provider.request({ method: 'eth_accounts' }),
            provider.request({ method: 'eth_chainId' }),
          ]), invalidated,
        ]);
        state.assertRevision(epoch);
        if (request !== sequence) throw changed('superseded');
        if (!Array.isArray(accounts) || !ADDRESS.test(accounts[0] || '')) {
          throw new Error('No wallet account is authorized. Reconnect your wallet.');
        }
        if (typeof chain !== 'string' || !/^0x[0-9a-f]+$/i.test(chain)) {
          throw new Error('Wallet network could not be verified. Reconnect before paying.');
        }
        return { address: getAddress(accounts[0]), chainId: BigInt(chain), revision: epoch };
      } finally { pending.delete(rejectRead); }
    },
    dispose() {
      disposed = true; ++revision; ++sequence; cancel('disposed');
      const remove = provider.removeListener || provider.off;
      events.forEach((event, index) => remove?.call(provider, event, handlers[index]));
      subscribers.clear(); states.delete(provider);
    },
  };
  states.set(provider, state);
  return state;
}

export function releaseWalletState(provider) { states.get(provider)?.dispose(); }

export function assertWalletIdentity(identity, chainId, address = null) {
  if (identity.chainId !== BigInt(chainId)) {
    throw new Error('Wallet is on the wrong network. Select Portaldot V3 Testnet in your wallet, then reconnect.');
  }
  if (address && identity.address.toLowerCase() !== address.toLowerCase()) {
    throw new Error('Active wallet account changed. Reconnect and review before signing.');
  }
}

// Only connection/restore retries a bounded burst of events. A financial action
// never retries its authorization after a change; the reviewed session is invalid.
export async function verifiedWallet(provider, chainId, expectedAddress = null, state = walletState(provider)) {
  let identity;
  for (let attempt = 0; attempt < 3; ++attempt) {
    try { identity = await state.read(); break; }
    catch (error) {
      if (error.code !== 'WALLET_STATE_CHANGED' || error.reason !== 'event' || attempt === 2) throw error;
    }
  }
  assertWalletIdentity(identity, chainId, expectedAddress);
  const guardedProvider = {
    request: async ({ method, params }) => {
      // getSigner must never implicitly request permissions after an account
      // changes. Explicit Connect is the sole eth_requestAccounts entry point.
      if (method === 'eth_requestAccounts') throw new Error('Reconnect your wallet to authorize account access.');
      if (method === 'eth_sendTransaction') {
        state.assertRevision(identity.revision);
        const current = await state.read();
        state.assertRevision(identity.revision);
        assertWalletIdentity(current, chainId, identity.address);
        const transaction = params?.[0];
        if (!transaction || String(transaction.from).toLowerCase() !== identity.address.toLowerCase()
            || (transaction.chainId != null && BigInt(transaction.chainId) !== BigInt(chainId))) {
          throw new Error('Transaction does not match the verified wallet and network. Review again.');
        }
        // The request remains chain-bound even if the user switches after the
        // handoff. The wallet still controls confirmation and must enforce it.
        return provider.request({ method, params: [{ ...transaction, chainId: '0x' + BigInt(chainId).toString(16) }] });
      }
      return provider.request({ method, params });
    },
  };
  const wallet = new BrowserProvider(guardedProvider, BigInt(chainId), { cacheTimeout: -1 });
  wallets.set(wallet, { provider, state, revision: identity.revision });
  return { wallet, provider, address: identity.address };
}

export async function verifiedSigner(wallet, expectedAddress, provider, chainId) {
  const metadata = wallets.get(wallet);
  if (!metadata || metadata.provider !== provider) throw new Error('Wallet session is no longer verified. Reconnect.');
  metadata.state.assertRevision(metadata.revision);
  const identity = await metadata.state.read();
  metadata.state.assertRevision(metadata.revision);
  assertWalletIdentity(identity, chainId, expectedAddress);
  // Construct only the signer for the already-authorized address. Unlike
  // BrowserProvider.getSigner(), this cannot open another permission prompt.
  return new JsonRpcSigner(wallet, expectedAddress);
}
