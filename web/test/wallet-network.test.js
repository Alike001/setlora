import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserProvider } from 'ethers';
import { walletState, releaseWalletState, verifiedWallet, verifiedSigner, assertWalletIdentity } from '../src/wallet-network.js';
import { isWalletStillAuthorized } from '../src/wallet-session.js';

const CHAIN = 420420777n, HEX = '0x190f1ca9';
const A = '0x' + '1'.repeat(40), B = '0x' + '2'.repeat(40);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function mock() {
  const listeners = new Map();
  const queues = new Map();
  const p = {
    chain: HEX, account: A, calls: [],
    request({ method, params }) {
      p.calls.push({ method, params });
      if (queues.get(method)?.length) { const held = queues.get(method).shift(); held.started.resolve(); return held.promise; }
      if (method === 'eth_chainId') return Promise.resolve(p.chain);
      if (method === 'eth_accounts') return Promise.resolve(p.account ? [p.account] : []);
      if (method === 'eth_sendTransaction') return Promise.resolve('0x' + 'a'.repeat(64)); // synthetic boundary only
      return Promise.reject(new Error('Unexpected request ' + method));
    },
    hold(method) { const d = deferred(); d.started = deferred(); if (!queues.has(method)) queues.set(method, []); queues.get(method).push(d); return d; },
    on(event, fn) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); },
    removeListener(event, fn) { listeners.get(event)?.delete(fn); },
    emit(event, value) { for (const fn of [...listeners.get(event) || []]) fn(value); },
    count(event) { return listeners.get(event)?.size || 0; },
  };
  return p;
}
const cleanup = (t, p, ...wallets) => t.after(() => { releaseWalletState(p); wallets.forEach(w => w.destroy()); });
const stale = error => error.code === 'WALLET_STATE_CHANGED';

test('root-cause reproduction: any-network getNetwork returns the prior chain on the changing call', async () => {
  const p = mock(); p.chain = '0x1';
  const legacy = new BrowserProvider(p, 'any');
  try {
    assert.equal((await legacy.getNetwork()).chainId, 1n);
    p.chain = HEX;
    assert.equal((await legacy.getNetwork()).chainId, 1n);
    assert.equal((await legacy.getNetwork()).chainId, CHAIN);
  } finally { legacy.destroy(); }
});

test('fresh verification immediately accepts V3 without switching the network', async t => {
  const p = mock(); const next = await verifiedWallet(p, CHAIN); cleanup(t, p, next.wallet);
  assert.equal(next.address, A);
  assert.equal((await next.wallet.getNetwork()).chainId, CHAIN);
  assert.ok(p.calls.every(c => ['eth_accounts', 'eth_chainId'].includes(c.method)));
});

test('readiness rejects a different injected provider and a silently changed account or chain', async t => {
  const selected=mock(),other=mock();
  const next=await verifiedWallet(selected,CHAIN);cleanup(t,selected,next.wallet);cleanup(t,other);
  await assert.rejects(verifiedSigner(next.wallet,A,other,CHAIN),/no longer verified/);
  assert.equal(other.calls.length,0);
  selected.account=B;
  await assert.rejects(verifiedSigner(next.wallet,A,selected,CHAIN),/account changed/);
  selected.account=A;selected.chain='0x1';
  await assert.rejects(verifiedSigner(next.wallet,A,selected,CHAIN),e=>e.code==='WALLET_WRONG_NETWORK');
  assert.ok(!selected.calls.some(c=>/send|sign|requestAccounts/i.test(c.method)));
});

test('rapid V3/other/V3 events invalidate old responses and accept only the latest read', async t => {
  const p = mock(), state = walletState(p); cleanup(t, p);
  const oldChain = p.hold('eth_chainId');
  const old = state.read(); const rejected = assert.rejects(old, stale);
  p.chain = '0x1'; p.emit('chainChanged', '0x1');
  const middle = await state.read(); assert.throws(() => assertWalletIdentity(middle, CHAIN), /wrong network/);
  p.chain = HEX; p.emit('chainChanged', HEX);
  const current = await state.read(); assertWalletIdentity(current, CHAIN);
  oldChain.resolve('0x1'); await rejected;
  assert.equal(current.chainId, CHAIN);
});

test('multiple close events leave one observer and invalidate the previous session revision', async t => {
  const p = mock(); const next = await verifiedWallet(p, CHAIN); cleanup(t, p, next.wallet);
  const state = walletState(p);
  assert.equal(walletState(p), state);
  for (let i = 0; i < 5; ++i) p.emit('chainChanged', HEX);
  assert.equal(p.count('chainChanged'), 1); assert.equal(p.count('accountsChanged'), 1);
  await assert.rejects(verifiedSigner(next.wallet, A, p, CHAIN), stale);
  const fresh = await verifiedWallet(p, CHAIN); t.after(() => fresh.wallet.destroy());
  assert.equal(await (await verifiedSigner(fresh.wallet, A, p, CHAIN)).getAddress(), A);
});

test('older successful RPC replies cannot overwrite a newer wrong-network response', async t => {
  const p = mock(), state = walletState(p); cleanup(t, p);
  const slow = p.hold('eth_chainId');
  const older = state.read(); const rejected = assert.rejects(older, stale);
  p.chain = '0x1';
  const newer = await state.read();
  slow.resolve(HEX); await rejected;
  assert.throws(() => assertWalletIdentity(newer, CHAIN), /wrong network/);
});

test('older wrong-network RPC replies cannot overwrite a newer correct response', async t => {
  const p = mock(), state = walletState(p); cleanup(t, p);
  const slow = p.hold('eth_chainId');
  const older = state.read(); const rejected = assert.rejects(older, stale);
  const newer = await state.read();
  slow.resolve('0x1'); await rejected; assertWalletIdentity(newer, CHAIN);
});

test('account change during network verification rejects the old account and verifies the new one', async t => {
  const p = mock(); const next = await verifiedWallet(p, CHAIN); cleanup(t, p, next.wallet);
  const slow = p.hold('eth_chainId');
  const pending = verifiedSigner(next.wallet, A, p, CHAIN); const rejected = assert.rejects(pending, stale);
  p.account = B; p.emit('accountsChanged', [B]); slow.resolve(HEX); await rejected;
  const fresh = await verifiedWallet(p, CHAIN); t.after(() => fresh.wallet.destroy());
  assert.equal(fresh.address, B);
});

test('connection verification tolerates a bounded event burst and uses the latest account', async t => {
  const p = mock(); cleanup(t, p);
  const slow = p.hold('eth_chainId');
  const pending = verifiedWallet(p, CHAIN);
  p.account = B; p.emit('accountsChanged', [B]); p.emit('chainChanged', HEX);
  slow.resolve('0x1');
  const fresh = await pending; t.after(() => fresh.wallet.destroy());
  assert.equal(fresh.address, B);
});

test('disconnect while a check is pending rejects it before its old RPC response arrives', async t => {
  const p = mock(), state = walletState(p); cleanup(t, p);
  const slow = p.hold('eth_chainId');
  const pending = state.read(); const rejected = assert.rejects(pending, stale);
  p.emit('disconnect', {code:4900}); releaseWalletState(p);
  await rejected;
  slow.resolve(HEX);
  assert.equal(p.count('chainChanged'), 0); assert.equal(p.count('disconnect'), 0);
});

test('refresh on a different chain cannot silently restore prior authorization', async t => {
  const p = mock(); cleanup(t, p);
  p.chain = '0x1';
  assert.equal(await isWalletStillAuthorized(p, {address:A}, CHAIN), false);
  await assert.rejects(verifiedWallet(p, CHAIN, A), /wrong network/);
  p.chain = HEX;
  assert.equal(await isWalletStillAuthorized(p, {address:A}, CHAIN), true);
  const restored = await verifiedWallet(p, CHAIN, A); t.after(() => restored.wallet.destroy());
  assert.equal(restored.address, A);
  assert.ok(!p.calls.some(c => /requestAccounts|switch|send|sign/i.test(c.method)));
});

test('returning to V3 requires a fresh session; old review signer cannot revive', async t => {
  const p = mock(); const next = await verifiedWallet(p, CHAIN); cleanup(t, p, next.wallet);
  p.chain = '0x1'; p.emit('chainChanged', p.chain);
  await assert.rejects(verifiedWallet(p, CHAIN), /wrong network/);
  p.chain = HEX; p.emit('chainChanged', HEX);
  await assert.rejects(verifiedSigner(next.wallet, A, p, CHAIN), stale);
  const fresh = await verifiedWallet(p, CHAIN); t.after(() => fresh.wallet.destroy());
  assert.equal(await (await verifiedSigner(fresh.wallet, A, p, CHAIN)).getAddress(), A);
});

test('unresolved chain reads prevent both approval and settlement transaction requests', async t => {
  // Approval and settlement use the same guarded eth_sendTransaction boundary.
  for (const data of ['0x095ea7b3', '0x23436a85']) {
    const p = mock(); const next = await verifiedWallet(p, CHAIN); cleanup(t, p, next.wallet);
    const slow = p.hold('eth_chainId');
    const pending = next.wallet.send('eth_sendTransaction', [{from:A,to:B,data}]);
    const rejected = assert.rejects(pending);
    await slow.started.promise;
    assert.equal(p.calls.filter(c => c.method === 'eth_sendTransaction').length, 0);
    p.emit('chainChanged', '0x1');
    slow.resolve(HEX); await rejected;
    assert.equal(p.calls.filter(c => c.method === 'eth_sendTransaction').length, 0);
  }
});

test('transaction handoff checks account and chain, and pins the synthetic request to V3', async t => {
  const p = mock(); const next = await verifiedWallet(p, CHAIN); cleanup(t, p, next.wallet);
  await next.wallet.send('eth_sendTransaction', [{from:A,to:B,data:'0x095ea7b3'}]);
  assert.equal(p.calls.find(c => c.method === 'eth_sendTransaction').params[0].chainId, HEX);
  const count = p.calls.length;
  p.account = B; // Even a provider that omits accountsChanged is rechecked.
  await assert.rejects(next.wallet.send('eth_sendTransaction', [{from:A,to:B,data:'0x23436a85'}]));
  assert.equal(p.calls.slice(count).filter(c => c.method === 'eth_sendTransaction').length, 0);
});

test('genuine wrong-network, malformed chain and missing account are never ready', async t => {
  const p = mock(); cleanup(t, p);
  for (const value of ['0x1', '0x0']) { p.chain = value; await assert.rejects(verifiedWallet(p, CHAIN), /wrong network/); }
  for (const value of [null, '', '0x', 'nonsense']) { p.chain = value; await assert.rejects(verifiedWallet(p, CHAIN), /could not be verified/); }
  p.chain = HEX; p.account = null;
  await assert.rejects(verifiedWallet(p, CHAIN), /No wallet account/);
});

test('observer cleanup and reattachment do not duplicate wallet listeners', () => {
  const p = mock(); let notifications = 0;
  const stop = walletState(p).subscribe(() => notifications++);
  p.emit('chainChanged', HEX); stop(); releaseWalletState(p);
  walletState(p).subscribe(() => notifications++);
  p.emit('chainChanged', HEX);
  assert.equal(notifications, 2); assert.equal(p.count('chainChanged'), 1);
  releaseWalletState(p); assert.equal(p.count('chainChanged'), 0);
});
