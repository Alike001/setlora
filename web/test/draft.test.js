import test from 'node:test';
import assert from 'node:assert/strict';
import {draftStorageKey, sanitizedDraftRows, loadDraft, saveDraft, hasDraftContent} from '../src/draft.js';
const one = '0x' + 'a'.repeat(40);
const two = '0x' + 'b'.repeat(40);
const contract = '0x' + 'c'.repeat(40);
function mockStorage() { const m = new Map(); return { getItem:k=>m.get(k)??null, setItem:(k,v)=>m.set(k,v), removeItem:k=>m.delete(k), entries:m }; }
const row = { invoice:'1001', recipient:one, amount:'0.10', note:'Design' };
test('drafts separated by account, network and contract',()=>{
  const a=draftStorageKey(420420777n,contract,one);
  assert.notEqual(a,draftStorageKey(420420777n,contract,two));
  assert.notEqual(a,draftStorageKey(1n,contract,one));
  assert.notEqual(a,draftStorageKey(420420777n,two,one));
  assert.equal(a,draftStorageKey(420420777n,contract.toUpperCase().replace('0X','0x'),one.toUpperCase().replace('0X','0x')));
});
test('saved drafts survive reload and preserve exact entered amounts',()=>{
  const store=mockStorage(), key=draftStorageKey(420420777n,contract,one);
  assert.equal(saveDraft(store,key,[row]),true);
  assert.deepEqual(loadDraft(store,key),[row]);
  assert.equal(saveDraft(store,key,[{invoice:'',recipient:'',amount:'',note:''}]),false);
  assert.equal(loadDraft(store,key),null);
});
test('invalid and untrusted stored drafts are not restored',()=>{
  const store=mockStorage(), key='demo';
  store.setItem(key,JSON.stringify({version:1,rows:Array.from({length:11},()=>row)}));
  assert.equal(loadDraft(store,key),null);
  store.setItem(key,JSON.stringify({version:1,rows:[{...row,note:'A'.repeat(101)}]}));
  assert.equal(loadDraft(store,key),null);
  store.setItem(key,'{notJSON'); assert.equal(loadDraft(store,key),null);
  assert.equal(sanitizedDraftRows([{...row,privateKey:'notSaved'}])[0].privateKey,undefined);
  assert.equal(hasDraftContent([{invoice:'',recipient:'',amount:'',note:''}]),false);
});
