import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/csv.js';
test('CSV import with note',()=>{const r=parseCsv('invoice,recipient,amount,note\n1,0xabc,2.5,"Design, phase 2"');assert.equal(r[0].note,'Design, phase 2');});
test('CSV missing headers refused',()=>assert.throws(()=>parseCsv('name,value\na,1'),/headers/));
test('CSV too many rows refused',()=>assert.throws(()=>parseCsv('invoice,recipient,amount\n'+Array.from({length:11},(_,i)=>`${i+1},x,1`).join('\n')),/10 invoices/));
test('CSV quote escaped',()=>assert.equal(parseCsv('invoice,recipient,amount,note\n1,x,2,"a ""quote"""')[0].note,'a "quote"'));

test('Header-only CSV rejected',()=>assert.throws(()=>parseCsv('invoice,recipient,amount,note\n'),/no invoice rows/));
