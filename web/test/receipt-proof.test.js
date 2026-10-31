import test from 'node:test';
import assert from 'node:assert/strict';
import {assessSettlementProof} from '../src/status.js';
const payer='0x'+'a'.repeat(40), contract='0x'+'b'.repeat(40), recipient='0x'+'c'.repeat(40), hash='0x'+'e'.repeat(64), blockHash='0x'+'d'.repeat(64), calldata='0x12345678';
const items=[{invoice:1001n,recipient,amount:100000n}];
const goodReceipt={hash,from:payer,to:contract,blockHash,status:1};
const goodTx={from:payer,to:contract,data:calldata,chainId:420420777n};
const invoiceEvents=[{payer,recipient,invoice:1001n,amount:100000n}];
const batchEvent={payer,count:1n,total:100000n};
function proof(patch={}) {return assessSettlementProof({receipt:goodReceipt,transaction:goodTx,hash,payer,contract,expectedData:calldata,chainId:420420777n,block:{hash:blockHash},invoiceEvents,batchEvent,items,settled:['1001'],...patch});}
test('receipt and exact events confirm settlement without separate transaction retrieval',()=>{
  assert.equal(proof({transaction:null}).status,'confirmed');
  assert.equal(proof().status,'confirmed');
});
test('missing receipt never becomes confirmed just because flags are true',()=>{
  assert.equal(proof({receipt:null}).status,'unknown');
});
test('wrong receipt identity, block or events prevent confirmation',()=>{
  assert.equal(proof({receipt:{...goodReceipt,hash:'0x'+'f'.repeat(64)}}).status,'mismatch');
  assert.equal(proof({receipt:{...goodReceipt,to:recipient}}).status,'mismatch');
  assert.equal(proof({block:{hash:'0x'+'f'.repeat(64)}}).status,'unknown');
  assert.equal(proof({invoiceEvents:[{...invoiceEvents[0],amount:2n}]}).status,'mismatch');
  assert.equal(proof({batchEvent:{...batchEvent,total:2n}}).status,'mismatch');
  assert.equal(proof({settled:[]}).status,'unknown');
});
test('failed receipt without matching calldata stays unknown, never unlocks retry',()=>{
  assert.equal(proof({receipt:{...goodReceipt,status:0},transaction:null}).status,'unknown');
  assert.equal(proof({receipt:{...goodReceipt,status:0}}).status,'failed');
  assert.equal(proof({transaction:{...goodTx,data:'0xabcdef00'}}).status,'mismatch');
});
