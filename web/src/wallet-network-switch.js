import { walletState, assertWalletIdentity } from './wallet-network.js';

const pending = new WeakMap();
const interrupted = () => Object.assign(new Error('Wallet disconnected during network switching. Reconnect before trying again.'), { code: 'WALLET_SWITCH_DISCONNECTED' });

// Only the explicit switch-button handler calls this. This helper requests no
// account permission, chain addition, token approval, signature or transaction.
export async function switchWalletNetwork(provider, chainIdHex) {
  if (!provider?.request) throw new Error('Select an installed EVM wallet first.');
  if (!/^0x[0-9a-f]+$/i.test(chainIdHex)) throw new Error('Invalid target chain ID.');
  if (pending.has(provider)) throw Object.assign(new Error('A network switch is already pending in this wallet.'), { code: -32002 });
  const state = walletState(provider);
  const revision = state.invalidate(); // Invalidate old reviewed signers even without an event.
  let rejectDisconnect;
  const disconnected = new Promise((_, reject) => { rejectDisconnect = reject; });
  const stop = state.subscribe(event => { if (event === 'disconnect') rejectDisconnect(interrupted()); });
  // Retain the per-provider lock until the underlying request actually settles,
  // even if disconnect makes the local operation return sooner.
  const token = {};
  let requestSettled = false, finished = false;
  const release = () => {
    if (requestSettled && finished && pending.get(provider) === token) pending.delete(provider);
  };
  pending.set(provider, token);
  const request = Promise.resolve().then(() => {
    state.assertRevision(revision);
    return provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] });
  });
  void request.finally(() => {
    requestSettled = true; release();
  }).catch(() => {});
  try {
    await Promise.race([request, disconnected]);
    for (let attempt = 0; attempt < 3; ++attempt) {
      try {
        const identity = await state.read();
        assertWalletIdentity(identity, BigInt(chainIdHex));
        return { status: 'switched', identity, revision: identity.revision };
      } catch (error) {
        if (error.code === 'WALLET_ACCOUNT_UNAUTHORIZED') {
          // A successful switch is not account authorization. Confirm the actual
          // chain, but never open eth_requestAccounts as an implicit follow-up.
          assertWalletIdentity({ chainId: error.chainId }, BigInt(chainIdHex));
          return { status: 'needs-account', chainId: error.chainId, revision: error.revision };
        }
        if (error.code !== 'WALLET_STATE_CHANGED' || error.reason !== 'event' || attempt === 2) throw error;
      }
    }
  } finally { finished = true; stop(); release(); }
}

export function explainNetworkSwitchError(error) {
  const codes = [error?.code, error?.error?.code, error?.info?.error?.code, error?.data?.originalError?.code].map(String);
  if (codes.includes('4001') || codes.includes('ACTION_REJECTED')) return {
    kind: 'rejected', message: 'Network switch cancelled. Your payment is disabled. Use Switch to Portaldot V3 when you are ready.',
  };
  if (codes.includes('4902')) return {
    kind: 'unknown-chain', message: 'Portaldot V3 is not installed in this wallet. Use Add Portaldot V3 Testnet for manual setup instructions.',
  };
  if (codes.includes('4200') || codes.includes('-32601')) return {
    kind: 'unsupported', message: 'This wallet does not support network switching from websites. Select Portaldot V3 manually in the selected wallet, then reconnect.',
  };
  if (codes.includes('-32002')) return {
    kind: 'pending', message: 'Another wallet request is pending. Open the selected wallet and finish or dismiss it before clicking Switch again.',
  };
  if (codes.includes('4900') || codes.includes('WALLET_SWITCH_DISCONNECTED') || error?.reason === 'disconnected' || error?.reason === 'disposed') return {
    kind: 'disconnected', message: 'Wallet disconnected during network switching. Reconnect before trying again.',
  };
  if (codes.includes('WALLET_WRONG_NETWORK')) return {
    kind: 'wrong-network', message: 'The wallet is still on the wrong network. Select Portaldot V3 manually or try Switch again. Payment is disabled.',
  };
  return {
    kind: 'unverified', message: 'The network switch could not be verified. Check the selected wallet, then reconnect. No payment was requested.',
  };
}
