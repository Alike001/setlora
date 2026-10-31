import test from 'node:test';
import assert from 'node:assert/strict';
import {isUnresolved, makeVerifiedReceipt, isWalletRejection, attachRecoveredHash, matchesTransactionIntent} from '../src/status.js';
const addr = '0x' + 'a'.repeat(40);
const hash = '0x' + '1'.repeat(64);
const good = {hash, payer:addr, status:'confirmed', items:[{invoice:'12',recipient:addr,amount:'25000000'}],chainId:'420420777',contract:addr};
test('Unknown and mismatched receipts prevent retry',()=>{assert.equal(isUnresolved({status:'unknown'}),true);assert.equal(isUnresolved({status:'mismatch'}),true);assert.equal(isUnresolved({status:'confirmed'}),false);assert.equal(isUnresolved(null),false);});
test('Export requires fully confirmed status',()=>assert.throws(()=>makeVerifiedReceipt({...good,status:'unknown'},420420777n,addr),/confirmed/));
test('Export forbids wrong chain or contract',()=>{assert.throws(()=>makeVerifiedReceipt({...good,chainId:'1'},420420777n,addr),/network/);assert.throws(()=>makeVerifiedReceipt({...good,contract:'0x'+'b'.repeat(40)},420420777n,addr),/contract/);});
test('Verified receipt preserves integer base units and payer',()=>{const r=makeVerifiedReceipt(good,420420777n,addr);assert.equal(r.invoices[0].amountBaseUnits,'25000000');assert.equal(r.transactionHash,hash);assert.equal(r.payer,addr);});

test('Signing and unknown wallet submission remain blocked after reload',()=>{
  assert.equal(isUnresolved({status:'signing',hash:null}),true);
  assert.equal(isUnresolved({status:'unknown',hash:null}),true);
  assert.equal(isUnresolved({status:'mismatch',hash:hash}),true);
  assert.equal(isUnresolved({status:'failed',hash:hash}),false);
});
test('Only explicit rejection permits safe clearing of pending pre-signing attempt',()=>{
  assert.equal(isWalletRejection({code:4001}),true);
  assert.equal(isWalletRejection({code:'ACTION_REJECTED'}),true);
  assert.equal(isWalletRejection({info:{error:{code:4001}}}),true);
  assert.equal(isWalletRejection({code:'NETWORK_ERROR'}),false);
  assert.equal(isWalletRejection({code:-32603}),false);
});
test('Recovery hash attaches to original snapshot and still requires independent verification',()=>{
  const pending={status:'signing',hash:null,chainId:'420420777',contract:addr,payer:addr,items:good.items};
  const recovered=attachRecoveredHash(pending,hash);
  assert.equal(recovered.hash,hash);
  assert.equal(recovered.status,'unknown');
  assert.equal(recovered.items.length,1);
  assert.throws(()=>attachRecoveredHash(pending,'0x123'),/transaction hash/);
  assert.throws(()=>attachRecoveredHash(recovered,hash),/hashless/);
  assert.throws(()=>attachRecoveredHash({...pending,items:[]},hash),/snapshot/);
  assert.throws(()=>makeVerifiedReceipt(recovered,420420777n,addr),/confirmed/);
});

test('Only matching sender, contract, chain and exact calldata unlock a reverted attempt',()=>{
 const calldata='0x12345678'; const tx={from:addr,to:addr,chainId:420420777n,data:calldata};
 assert.equal(matchesTransactionIntent(tx,addr,addr,calldata,420420777n),true);
 assert.equal(matchesTransactionIntent({...tx,data:'0xdeadbeef'},addr,addr,calldata,420420777n),false);
 assert.equal(matchesTransactionIntent({...tx,from:'0x'+'b'.repeat(40)},addr,addr,calldata,420420777n),false);
 assert.equal(matchesTransactionIntent({...tx,chainId:1n},addr,addr,calldata,420420777n),false);
 assert.equal(matchesTransactionIntent(null,addr,addr,calldata,420420777n),false);
});
