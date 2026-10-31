import test from 'node:test';
import assert from 'node:assert/strict';
import {historyKey,readHistory,addVerifiedHistory,validHistoryEntry,totalHistoryAmount} from '../src/history.js';
const payer='0x'+'a'.repeat(40), other='0x'+'b'.repeat(40), contract='0x'+'c'.repeat(40), otherContract='0x'+'d'.repeat(40);
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
const record=(hashDigit='1')=>({hash:'0x'+hashDigit.repeat(64),payer,contract,chainId:'420420777',status:'confirmed',checkedAt:'2026-10-31T06:00:00Z',items:[{invoice:'1001',recipient:other,amount:'100000'},{invoice:'1002',recipient:payer,amount:'150000'}]});
test('per-wallet, chain, contract history keys do not overlap',()=>{
 assert.notEqual(historyKey(420420777n,contract,payer),historyKey(420420777n,contract,other));
 assert.notEqual(historyKey(420420777n,contract,payer),historyKey(420420778n,contract,payer));
 assert.notEqual(historyKey(420420777n,contract,payer),historyKey(420420777n,otherContract,payer));
});
test('one valid confirmed batch is saved with exact base units',()=>{
 const store=storage(), r=record();
 assert.equal(addVerifiedHistory(store,420420777n,contract,payer,r),true);
 const saved=readHistory(store,420420777n,contract,payer);
 assert.equal(saved.length,1);
 assert.equal(totalHistoryAmount(saved[0]),250000n);
 assert.equal(saved[0].items[1].amount,'150000');
});
test('history upsert is idempotent and never duplicates the same hash',()=>{
 const store=storage();
 assert.equal(addVerifiedHistory(store,420420777n,contract,payer,record()),true);
 assert.equal(addVerifiedHistory(store,420420777n,contract,payer,record()),true);
 assert.equal(readHistory(store,420420777n,contract,payer).length,1);
});
test('unverified, incomplete, and cross-account records are never archived',()=>{
 const store=storage();
 assert.equal(addVerifiedHistory(store,420420777n,contract,payer,{...record(),status:'unknown'}),false);
 assert.equal(addVerifiedHistory(store,420420777n,contract,payer,{...record(),payer:other}),false);
 assert.equal(addVerifiedHistory(store,420420777n,contract,payer,{...record(),items:[{invoice:'1',amount:'1',recipient:'bad'}]}),false);
 assert.equal(readHistory(store,420420777n,contract,payer).length,0);
});
test('tampered local storage cannot display another payer, duplicates or invalid invoices',()=>{
 const store=storage(); const key=historyKey('420420777',contract,payer);
 store.setItem(key, JSON.stringify([record(), {...record('2'), payer:other}, {...record('3'), items:[{invoice:'0',recipient:other,amount:'1'}]},record()]));
 assert.equal(readHistory(store,420420777n,contract,payer).length,1);
});
test('history cannot leak by searching from another wallet or contract',()=>{
 const store=storage();addVerifiedHistory(store,420420777n,contract,payer,record());
 assert.equal(readHistory(store,420420777n,contract,other).length,0);
 assert.equal(readHistory(store,420420777n,otherContract,payer).length,0);
});
test('corrupt storage and write failure do not crash',()=>{
 const store=storage();store.setItem(historyKey(420420777n,contract,payer),'not json');
 assert.deepEqual(readHistory(store,420420777n,contract,payer),[]);
 assert.equal(addVerifiedHistory({getItem(){return null;},setItem(){throw new Error('quota');}},420420777n,contract,payer,record()),false);
});
test('history retains only the latest 30 batches',()=>{
 const store=storage();
 for(let i=0;i<35;i++){let h=(i+1).toString(16).padStart(64,'0');addVerifiedHistory(store,420420777n,contract,payer,{...record(),hash:'0x'+h});}
 assert.equal(readHistory(store,420420777n,contract,payer).length,30);
});
test('validHistoryEntry strictly rejects negative or invalid integer amounts',()=>{
 assert.equal(validHistoryEntry({...record(),items:[{invoice:'1',amount:'-1',recipient:other}]},420420777n,contract,payer),false);
 assert.equal(validHistoryEntry(record(),420420777n,contract,payer),true);
});
