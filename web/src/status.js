import { matchesSettlementEvents } from './invoice.js';
export const UNRESOLVED_STATUSES = new Set(['signing', 'unknown', 'mismatch']);
export function isUnresolved(record) {
  return Boolean(record && UNRESOLVED_STATUSES.has(record.status));
}
export function makeVerifiedReceipt(record, chainId, contractAddress) {
  if (!record || record.status !== 'confirmed' || !/^0x[\da-fA-F]{64}$/.test(record.hash || '')) {
    throw new Error('A confirmed onchain transaction is required before exporting a receipt');
  }
  if (!record.payer || !Array.isArray(record.items) || !record.items.length) {
    throw new Error('Missing receipt verification snapshot');
  }
  if (record.chainId != null && String(record.chainId) !== String(chainId)) {
    throw new Error('Saved transaction belongs to a different network');
  }
  if (record.contract && record.contract.toLowerCase() !== contractAddress.toLowerCase()) {
    throw new Error('Saved transaction belongs to a different contract');
  }
  return {
    schema: 'setlora.testnet.receipt.v1',
    warning: 'Testnet only. Independently verify this transaction and contract onchain; a local export is not an independent attestation.',
    chainId: String(chainId), contract: contractAddress,
    transactionHash: record.hash, payer: record.payer, status: 'confirmed',
    invoices: record.items.map(item => ({ invoiceNumber: String(item.invoice), recipient: item.recipient, amountBaseUnits: String(item.amount), tokenDecimals: 6 })),
    verification: 'Receipt status + exact InvoiceSettled events + BatchSettled totals + payer settlement flags were checked by the app',
  };
}

// A wallet rejection means the provider explicitly did NOT broadcast the request.
// All other errors after opening the wallet prompt are ambiguous until checked.
export function isWalletRejection(error) {
  const codes = [error?.code, error?.error?.code, error?.info?.error?.code];
  return codes.some(code => code === 4001 || code === '4001' || code === 'ACTION_REJECTED');
}

const TX_HASH = /^0x[\da-fA-F]{64}$/;

// Attach a hash copied from wallet activity to the saved pre-signing snapshot.
// Do not allow an arbitrary hash to create a verified receipt by itself.
export function attachRecoveredHash(record, hash) {
  if (!record || !isUnresolved(record) || record.hash) {
    throw new Error('No unresolved hashless settlement to recover');
  }
  if (!record.payer || !record.chainId || !record.contract || !Array.isArray(record.items) || !record.items.length) {
    throw new Error('Missing original payment snapshot');
  }
  if (!TX_HASH.test(String(hash).trim())) throw new Error('Expected a 0x-prefixed, 32-byte transaction hash');
  return {
    ...record, hash: String(hash).trim(), status: 'unknown',
    message: 'Hash recovered from wallet. Verifying receipt and exact invoice events before any retry.'
  };
}

// A failed *unrelated* transaction cannot be used to clear a Setlora pending
// settlement. Confirm exact sender, target, calldata, and network first.
export function matchesTransactionIntent(tx, payer, contract, calldata, chainId) {
  if (!tx || !payer || !contract || !calldata) return false;
  if (String(tx.from ?? '').toLowerCase() !== payer.toLowerCase()) return false;
  if (String(tx.to ?? '').toLowerCase() !== contract.toLowerCase()) return false;
  if (String(tx.data ?? '').toLowerCase() !== calldata.toLowerCase()) return false;
  if (tx.chainId != null && BigInt(tx.chainId) !== BigInt(chainId)) return false;
  return true;
}


// Receipt-first proof: some RPC nodes expose the receipt but not the full
// transaction object. A SUCCESS receipt + contract-emitted exact events +
// canonical block + settlement flags is independently sufficient to establish
// this batch's result, even without transaction calldata retrieval.
// A FAILED receipt cannot safely clear an attempt without matching calldata.
export function assessSettlementProof({ receipt, transaction, hash, payer, contract, expectedData,
  chainId, block, invoiceEvents, batchEvent, items, settled }) {
  if (transaction && !matchesTransactionIntent(transaction, payer, contract, expectedData, chainId)) {
    return { status: 'mismatch', reason: 'Transaction details differ from the saved payment. Do not retry.' };
  }
  if (!receipt) return { status: 'unknown', reason: 'Transaction receipt is unavailable. Do not submit again.' };
  if (String(receipt.hash || receipt.transactionHash || '').toLowerCase() !== String(hash).toLowerCase()
    || String(receipt.from || '').toLowerCase() !== payer.toLowerCase()
    || String(receipt.to || '').toLowerCase() !== contract.toLowerCase()) {
    return { status: 'mismatch', reason: 'Receipt does not match the saved transaction hash, payer, or contract.' };
  }
  if (!block || !receipt.blockHash || String(block.hash || '').toLowerCase() !== receipt.blockHash.toLowerCase()) {
    return { status: 'unknown', reason: 'Receipt block could not be independently matched to its chain block.' };
  }
  if (receipt.status !== 1 && receipt.status !== 1n && receipt.status !== '0x1') {
    if (receipt.status === 0 || receipt.status === 0n || receipt.status === '0x0') {
      if (!transaction) return { status: 'unknown', reason: 'A failed receipt was found, but transaction calldata is unavailable. Do not retry.' };
      return { status: 'failed', reason: 'Matching batch transaction reverted. No invoice events were committed by that transaction.' };
    }
    return { status: 'unknown', reason: 'Receipt does not have a recognized success status.' };
  }
  if (!matchesSettlementEvents(invoiceEvents, payer, items)
    || !batchEvent || String(batchEvent.payer).toLowerCase() !== payer.toLowerCase()
    || BigInt(batchEvent.count) !== BigInt(items.length)
    || BigInt(batchEvent.total) !== items.reduce((sum, item) => sum + BigInt(item.amount), 0n)) {
    return { status: 'mismatch', reason: 'Receipt succeeded, but its invoice events or batch total do not match.' };
  }
  const paid = new Set(settled.map(id => BigInt(id).toString()));
  if (items.some(item => !paid.has(BigInt(item.invoice).toString()))) {
    return { status: 'unknown', reason: 'Exact receipt events were found, but settlement flags are not fully confirmed.' };
  }
  return { status: 'confirmed', reason: `Verified receipt and exact events for ${items.length} invoices, batch total and on-chain flags${transaction ? '.' : ' (the RPC did not return transaction calldata).'} ` .trim() };
}
