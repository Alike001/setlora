import test from 'node:test';
import assert from 'node:assert/strict';
import { WALLET_KEY, forgetWallet, rememberWallet, rememberedWallet, findWalletChoice, readRememberedWalletIdentity, isWalletStillAuthorized } from '../src/wallet-session.js';
import { walletState, releaseWalletState } from '../src/wallet-network.js';
const A = `0x${'a'.repeat(40)}`, C = `0x${'c'.repeat(40)}`;
const store = () => { const m = new Map(); return { getItem: k => m.get(k) || null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };
const choice = (provider = { request() {} }) => ({ id: 'uuid-per-page', rdns: 'io.metamask', name: 'MetaMask', provider });
test('remembers only wallet, address, chain and contract; explicit disconnect forgets it', () => {
  const storage = store();
  assert.equal(rememberWallet(storage, choice(), A, 420420777n, C), true);
  const parsed = JSON.parse(storage.getItem(WALLET_KEY));
  assert.deepEqual(Object.keys(parsed).sort(), ['address','chainId','contract','legacy','name','rdns','version'].sort());
  assert.equal(rememberedWallet(storage, 420420777n, C).address, A);
  forgetWallet(storage); assert.equal(rememberedWallet(storage, 420420777n, C), null);
});
test('wallet restore stays scoped and rejects a corrupt record', () => {
  const storage = store(); rememberWallet(storage, choice(), A, 420420777n, C);
  assert.equal(rememberedWallet(storage, 1n, C), null);
  assert.equal(rememberedWallet(storage, 420420777n, `0x${'d'.repeat(40)}`), null);
  storage.setItem(WALLET_KEY, '{bad'); assert.equal(rememberedWallet(storage, 420420777n, C), null);
});
test('restores uniquely by wallet metadata but never arbitrary wallet names', () => {
  const storage = store(); rememberWallet(storage, choice(), A, 420420777n, C);
  const record = rememberedWallet(storage, 420420777n, C);
  const match = choice();
  const other = { id: 'other', name: 'Rabby', rdns: 'io.rabby', provider: {request() {}} };
  assert.equal(findWalletChoice([other,match], record), match);
  assert.equal(findWalletChoice([match,choice()],record),null);
  assert.equal(findWalletChoice([other],record),null);
});
test('silent restore never requests permission or changes networks', async () => {
  const methods = [];
  const provider = {request: async ({method}) => {
    methods.push(method);
    return method === 'eth_accounts' ? [A] : method === 'eth_chainId' ? '0x190f1ca9' : null;
  }};
  // 420420777 in hex; verify from BigInt instead of hardcoding a wrong chain.
  provider.request = async ({method}) => {methods.push(method);return method === 'eth_accounts' ? [A] : `0x${(420420777).toString(16)}`;};
  assert.equal(await isWalletStillAuthorized(provider,{address:A},420420777n),true);
  assert.deepEqual(methods.sort(),['eth_accounts','eth_chainId'].sort());
});
test('does not silently restore when permission, account, or chain has changed', async () => {
  const ask = (accounts, chain) => ({ request: async ({method}) => method === 'eth_accounts' ? accounts : chain });
  assert.equal(await isWalletStillAuthorized(ask([], '0x190f1ca9'),{address:A},420420777n),false);
  assert.equal(await isWalletStillAuthorized(ask([C],`0x${(420420777).toString(16)}`),{address:A},420420777n),false);
  assert.equal(await isWalletStillAuthorized(ask([A],'0x1'),{address:A},420420777n),false);
});

test('remembered authorization distinguishes matching account on wrong chain from a revoked or different account', async t => {
  for (const accounts of [[A], [], [C]]) {
    const calls = [];
    const provider = {request: async ({method}) => {
      calls.push(method); return method === 'eth_accounts' ? accounts : '0x1';
    }};
    t.after(() => releaseWalletState(provider));
    const identity = await readRememberedWalletIdentity(provider, {address:A});
    if (accounts[0] === A) {
      assert.equal(identity.address.toLowerCase(), A);
      assert.equal(identity.chainId, 1n);
      walletState(provider).assertRevision(identity.revision);
    } else assert.equal(identity, null);
    assert.deepEqual(calls.sort(), ['eth_accounts', 'eth_chainId']);
  }
});

test('missing remembered selection never probes an installed provider', async () => {
  const provider = {request() { throw new Error('Discovery must not request identity'); }};
  assert.equal(await readRememberedWalletIdentity(provider, null), null);
});

test('network events invalidate a pending remembered identity check even if old RPC replies arrive later', async t => {
  let resolveChain;
  const events = new Map();
  const provider = {
    request: async ({method}) => method === 'eth_accounts' ? [A] : new Promise(resolve => {resolveChain = resolve;}),
    on: (event, handler) => events.set(event, handler),
    removeListener: event => events.delete(event),
  };
  t.after(() => releaseWalletState(provider));
  const checking = readRememberedWalletIdentity(provider, {address:A});
  events.get('chainChanged')('0x1');
  assert.equal(await checking, null);
  resolveChain('0x190f1ca9');
});
