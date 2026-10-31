import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAssetUnits, summarizeNativeAccount, mappedEvmHexFromAccountId, mapEvmHexToAccountId } from '../src/native-account.js';
const base = { details: { status:'Live', minBalance:'10000', isSufficient:false }, metadata: { symbol:'pUSD', decimals:6 }, system: { providers:'1', sufficients:'0',free:'10000000000000' } };
const e = (extra) => summarizeNativeAccount({ ...base, ...extra });
test('precise pUSD formatting including whole and huge balances',()=>{
  assert.equal(formatAssetUnits(100000,6),'0.1');
  assert.equal(formatAssetUnits(200000,6),'0.2');
  assert.equal(formatAssetUnits('18000000',6),'18');
  assert.equal(formatAssetUnits('999999999999999999999999',6),'999999999999999999.999999');
});
test('rejects negative balance and invalid precision',()=>{
  assert.throws(()=>formatAssetUnits(-1), /Negative/);
  assert.throws(()=>formatAssetUnits(1,19), /Unsupported/);
});
test('EVM address pads 20 bytes with twelve 0xEE bytes',()=>{
  const src='0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25';
  const bytes=mapEvmHexToAccountId(src);
  assert.equal(bytes.length,32);
  assert.equal(Array.from(bytes.slice(20)).every(x=>x===0xee),true);
  assert.equal(mappedEvmHexFromAccountId(bytes),src.toLowerCase());
});
test('cannot treat unrelated native AccountId32 as an EVM wallet',()=>{
  const bytes = new Uint8Array(32);
  assert.equal(mappedEvmHexFromAccountId(bytes),null);
});
test('existing liquid native pUSD holder is NOT claimed guaranteed ready',()=>{
  const result=e({asset:{balance:'100000',status:'Liquid',reason:'Consumer'}});
  assert.equal(result.kind,'existing');
  assert.match(result.help,/not a guarantee/i);
});
test('missing asset account but existing system account remains unknown',()=>{
  assert.equal(e({asset:null}).kind,'unknown');
});
test('missing both asset and system can need setup',()=>{
  assert.equal(e({asset:null,system:{ providers:'0', sufficients:'0'}}).kind,'setup');
});
test('restricted asset account blocked',()=>{
  assert.equal(e({asset:{balance:'100000',status:'Frozen'}}).kind,'blocked');
});
test('under-minimum record is unknown',()=>{
  assert.equal(e({asset:{balance:'5000',status:'Liquid'}}).kind,'unknown');
});
test('metadata mismatch never shows ready',()=>{
  assert.equal(e({asset:{balance:'100000',status:'Liquid'}, metadata: {symbol:'BOGUS',decimals:6}}).kind,'unknown');
});
test('missing live asset details never claims readiness',()=>{
  assert.equal(e({ details:null, asset:{balance:'100000',status:'Liquid'}}).kind,'unknown');
});
