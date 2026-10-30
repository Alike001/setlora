export const UNRESOLVED_STATUSES = new Set(['unknown', 'mismatch']);
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
