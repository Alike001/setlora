import test from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { extractBatchFromReceipt } from '../src/public-proof.js';

const iface = new ethers.Interface([
  'event InvoiceSettled(address indexed payer,uint256 indexed invoiceNumber,address indexed recipient,uint256 amount)',
  'event BatchSettled(address indexed payer,uint256 count,uint256 total)'
]);
const contract = '0x' + 'a'.repeat(40);
const payer = '0x' + 'b'.repeat(40);
const recipient = '0x' + 'c'.repeat(40);
function log(name, args, addr = contract) {
  const encoded = iface.encodeEventLog(iface.getEvent(name), args);
  return { address: addr, topics: encoded.topics, data: encoded.data };
}
const invoice = () => log('InvoiceSettled', [payer, 1001n, recipient, 100000n]);
const batch = () => log('BatchSettled', [payer, 1n, 100000n]);
const receipt = (logs = [invoice(), batch()]) => ({ from: payer, to: contract, logs });

test('extracts exact invoice and total from a legitimate contract receipt', () => {
  const result = extractBatchFromReceipt(receipt(), contract, iface);
  assert.equal(result.payer.toLowerCase(), payer.toLowerCase());
  assert.equal(result.total, 100000n);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].invoice, 1001n);
});
test('ignores other-contract logs and checks only configured Setlora contract', () => {
  const unrelated = log('InvoiceSettled', [payer, 999n, recipient, 500n], recipient);
  assert.equal(extractBatchFromReceipt(receipt([unrelated, invoice(), batch()]), contract, iface).items.length, 1);
  assert.throws(() => extractBatchFromReceipt({...receipt(),to:recipient}, contract, iface), /configured/);
});
test('rejects missing, repeated, mismatched or inconsistent events', () => {
  assert.throws(() => extractBatchFromReceipt(receipt([invoice()]), contract, iface), /exactly one/);
  assert.throws(() => extractBatchFromReceipt(receipt([invoice(), invoice(), log('BatchSettled',[payer,2n,200000n])]), contract, iface), /repeated/);
  assert.throws(() => extractBatchFromReceipt(receipt([invoice(), log('BatchSettled',[payer,1n,999n])]), contract, iface), /does not match/);
  assert.throws(() => extractBatchFromReceipt(receipt([log('InvoiceSettled',[recipient,1001n,recipient,100000n]),batch()]), contract, iface), /Invalid/);
  assert.throws(() => extractBatchFromReceipt(receipt([log('InvoiceSettled',[payer,1001n,recipient,0n]),batch()]), contract, iface), /Invalid/);
});
