import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/csv.js';
test('CSV import with note',()=>{const r=parseCsv('invoice,recipient,amount,note\n1,0xabc,2.5,"Design, phase 2"');assert.equal(r[0].note,'Design, phase 2');});
test('CSV missing headers refused',()=>assert.throws(()=>parseCsv('name,value\na,1'),/headers/));
test('CSV too many rows refused',()=>assert.throws(()=>parseCsv('invoice,recipient,amount\n'+Array.from({length:11},(_,i)=>`${i+1},x,1`).join('\n')),/10 invoices/));
test('CSV quote escaped',()=>assert.equal(parseCsv('invoice,recipient,amount,note\n1,x,2,"a ""quote"""')[0].note,'a "quote"'));

test('Header-only CSV rejected',()=>assert.throws(()=>parseCsv('invoice,recipient,amount,note\n'),/no invoice rows/));

test('CSV rejects duplicate headers before a later recipient can overwrite the first', () => {
  assert.throws(() => parseCsv('invoice,recipient,recipient,amount\n1,alice,bob,0.1'), /headers must be unique/);
  assert.throws(() => parseCsv('invoice,recipient,amount, Amount \n1,alice,0.1,0.2'), /headers must be unique/);
});

test('CSV rejects quotes embedded in unquoted fields', () => {
  for (const amount of ['0".1"', '"0.1"junk', '"0.1" "2"']) {
    assert.throws(() => parseCsv(`invoice,recipient,amount\n1,alice,${amount}`), /quote|quoted/);
  }
});

test('CSV preserves quoted fields, escaped quotes and multiline notes across CRLF rows', () => {
  const rows = parseCsv('\uFEFFinvoice,recipient,amount,note\r\n"1","alice","0.100001","Design, ""phase 2""\r\nComplete"\r\n2,bob,0.2,Next');
  assert.deepEqual(rows, [
    { invoice: '1', recipient: 'alice', amount: '0.100001', note: 'Design, "phase 2"\r\nComplete' },
    { invoice: '2', recipient: 'bob', amount: '0.2', note: 'Next' },
  ]);
});

test('CSV allows trailing horizontal whitespace after a closing quote', () => {
  assert.equal(parseCsv('invoice,recipient,amount\n1,alice,"0.1" \t')[0].amount, '0.1');
});
