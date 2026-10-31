import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRecipientReadiness, explainRecipientFailure } from '../src/readiness.js';
const items = [
  {invoice:1001n,recipient:'0x'+'a'.repeat(40),amount:100000n},
  {invoice:1002n,recipient:'0x'+'b'.repeat(40),amount:150000n},
  {invoice:1003n,recipient:'0x'+'c'.repeat(40),amount:200000n} ];
test('all successful read-only simulations show ready',async()=>{
  const result=await checkRecipientReadiness(items,async()=>true);
  assert.equal(result.ready,true); assert.equal(result.checks.length,3);
  assert.ok(result.checks.every(r=>r.status==='ready'));
});
test('one CannotCreate blocks the batch and gives native-account guidance',async()=>{
  const result=await checkRecipientReadiness(items,async item=>{if(item.invoice===1002n) throw new Error('Token(CannotCreate)'); return true;});
  assert.equal(result.ready,false); assert.equal(result.checks[1].status,'blocked');
  assert.match(result.checks[1].message,/native account/);
  assert.equal(result.checks[2].status,'ready');
});
test('an RPC outage fails closed rather than being treated as ready',async()=>{
  const result=await checkRecipientReadiness(items,async()=>{throw new Error('network timeout');});
  assert.equal(result.ready,false); assert.equal(result.checks.length,3);
  assert.match(result.checks[0].message,/network/);
});
test('simulation returning false blocks payment',async()=>{
  const result=await checkRecipientReadiness(items,async()=>false);
  assert.equal(result.ready,false);
});
test('a zero native balance alone never determines readiness',async()=>{
  const result=await checkRecipientReadiness(items,async()=>true);
  assert.equal(result.ready,true); // No balance-based heuristic.
});
test('invalid input is refused',async()=>{
  await assert.rejects(()=>checkRecipientReadiness([],async()=>true),/valid invoice/);
});
test('token min-balance and unknown errors are actionable, not guaranteed causes',()=>{
  assert.match(explainRecipientFailure('BelowMinimum'),/minimum/);
  assert.match(explainRecipientFailure('unrecognized error'),/could not simulate/);
});
