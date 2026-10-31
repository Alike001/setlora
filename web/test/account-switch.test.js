import test from 'node:test';
import assert from 'node:assert/strict';
import { requestAccountReselection } from '../src/wallet-session.js';
const A = '0x' + 'a'.repeat(40);
const B = '0x' + 'b'.repeat(40);

test('Switch account prompts for permission then reads the newly selected account', async () => {
  const methods = [];
  let current = A;
  const provider = { request: async ({method,params}) => {
    methods.push(method);
    if (method === 'wallet_requestPermissions') {
      assert.deepEqual(params, [{ eth_accounts: {} }]);
      current = B;
      return [{ parentCapability: 'eth_accounts' }];
    }
    if (method === 'eth_accounts') return [current];
    throw new Error(`Unexpected RPC ${method}`);
  } };
  assert.equal(await requestAccountReselection(provider), B);
  assert.deepEqual(methods, ['wallet_requestPermissions', 'eth_accounts']);
});
test('rejected selection never falls through to an ordinary connection', async () => {
  const methods = [];
  const provider = { request: async ({method}) => {methods.push(method); throw Object.assign(new Error('denied'),{code:4001});} };
  await assert.rejects(requestAccountReselection(provider), /selection cancelled/i);
  assert.deepEqual(methods, ['wallet_requestPermissions']);
});
test('wallet without account selection explains how to continue manually', async () => {
  for (const code of [4200,-32601]) {
    const provider = {request: async () => {throw Object.assign(new Error('unsupported'),{code});}};
    await assert.rejects(requestAccountReselection(provider), /wallet extension/i);
  }
});
test('does not accept empty or malformed account authorization', async () => {
  for (const accounts of [[],['0x123'],null]) {
    const provider = {request: async ({method}) => method==='wallet_requestPermissions' ? [] : accounts};
    await assert.rejects(requestAccountReselection(provider), /No wallet account was authorized/i);
  }
});
test('does not request permissions without a wallet provider', async () => {
  await assert.rejects(requestAccountReselection(null), /wallet is unavailable/i);
});
