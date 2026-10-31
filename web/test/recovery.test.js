import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverySnapshot, validRecoveryHash, recoveryActionState } from '../src/recovery.js';

const h='0x'+'a'.repeat(64), payer='0x'+'b'.repeat(40), contract='0x'+'c'.repeat(40);
const R1='0x'+'d'.repeat(40), R2='0x'+'e'.repeat(40);
const data='0x12345678';
const tx={hash:h,from:payer,to:contract,chainId:420420777n,value:0n,data};
const parsed={signature:'settle(uint256[],address[],uint256[])',args:[[1001n,1002n],[R1,R2],[100000n,150000n]]};
const options={hash:h,transaction:tx,parsed,encodedData:data,payer,contract,chainId:420420777n,isAddress:s=>/^0x[\da-fA-F]{40}$/.test(s)};
function recover(patch={}){return recoverySnapshot({...options,...patch});}

test('paste hash needs exactly 32 bytes of hex',()=>{
  assert.equal(validRecoveryHash(h),true);
  assert.equal(validRecoveryHash('  '+h+' '),true);
  for (const invalid of ['', '0x1234','x'+'a'.repeat(64),'0x'+'g'.repeat(64)]) assert.equal(validRecoveryHash(invalid),false);
});
test('valid historical batch produces strict unconfirmed snapshot',()=>{
  const result=recover();
  assert.deepEqual(result.items,[{invoice:'1001',recipient:R1,amount:'100000'},{invoice:'1002',recipient:R2,amount:'150000'}]);
  assert.equal(result.status,'unknown');
  assert.equal(result.payer,payer);
  assert.equal(result.hash,h);
  assert.equal(result.chainId,'420420777');
});
test('unrelated account, destination or network never recovers',()=>{
  assert.throws(()=>recover({transaction:{...tx,from:R1}}),/different wallet/);
  assert.throws(()=>recover({transaction:{...tx,to:R1}}),/not sent to/);
  assert.throws(()=>recover({transaction:{...tx,chainId:1n}}),/network/);
  assert.throws(()=>recover({transaction:{...tx,chainId:null}}),/network/);
  assert.throws(()=>recover({transaction:{...tx,hash:'0x'+'f'.repeat(64)}}),/hash returned/);
  assert.throws(()=>recover({transaction:{...tx,value:1n}}),/native tokens/);
});
test('strict canonical calldata and function selector are required',()=>{
  assert.throws(()=>recover({transaction:{...tx,data:'0xdeadbeef'}}),/calldata/);
  assert.throws(()=>recover({parsed:{...parsed,signature:'approve(address,uint256)'}}),/did not call/);
  assert.throws(()=>recover({transaction:null}),/calldata/);
});
test('invalid batches, duplicates, wrong recipient and zero amount are rejected',()=>{
  assert.throws(()=>recover({parsed:{...parsed,args:[[1001n,1001n],[R1,R2],[100000n,150000n]]}}),/duplicate/);
  assert.throws(()=>recover({parsed:{...parsed,args:[[1001n,1002n],[R1],[100000n,150000n]]}}),/batch size/);
  assert.throws(()=>recover({parsed:{...parsed,args:[[1001n,1002n],[R1,'0x'+'0'.repeat(40)],[100000n,150000n]]}}),/Invalid recipient/);
  assert.throws(()=>recover({parsed:{...parsed,args:[[1001n,1002n],[R1,R2],[100000n,0n]]}}),/Invalid recipient/);
});

test('already-confirmed transaction can be rechecked without importing another payment',()=>{
  const state = recoveryActionState({inputHash:h.toUpperCase().replace('0X','0x'),record:{hash:h,status:'confirmed'},ownsRecord:true,connected:true,busy:false,unresolved:false});
  assert.equal(state.disabled,false);
  assert.equal(state.mode,'recheck');
  assert.equal(state.label,'Recheck verified payment');
});
test('recovery still blocks missing permission, invalid hashes, busy UI and unresolved broadcasts',()=>{
  const base={inputHash:h,record:null,ownsRecord:false,connected:true,busy:false,unresolved:false};
  assert.deepEqual(recoveryActionState(base),{disabled:false,mode:'historical',label:'Verify previous payment'});
  assert.equal(recoveryActionState({...base,connected:false}).disabled,true);
  assert.equal(recoveryActionState({...base,inputHash:'0x1234'}).disabled,true);
  assert.equal(recoveryActionState({...base,busy:true}).disabled,true);
  assert.equal(recoveryActionState({...base,record:{hash:h,status:'unknown'},ownsRecord:true,unresolved:true}).disabled,true);
  const attach = recoveryActionState({...base,record:{hash:null,status:'unknown'},ownsRecord:true,unresolved:true});
  assert.equal(attach.mode,'attach');
  assert.equal(attach.disabled,false);
  assert.equal(attach.label,'Attach hash and verify');
});
