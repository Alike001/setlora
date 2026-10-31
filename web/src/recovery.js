import { MAX_INVOICES, UINT256_MAX } from './invoice.js';

const HASH = /^0x[0-9a-fA-F]{64}$/;
export function validRecoveryHash(value) {
  return HASH.test(String(value ?? '').trim());
}

// Choose one safe read-only recovery action; this keeps the button state and
// click handler in sync even after restoring a previous verified payment.
export function recoveryActionState({ inputHash, record, ownsRecord, connected, busy, unresolved }) {
  const hash = String(inputHash ?? '').trim();
  const valid = validRecoveryHash(hash);
  const hashlessPending = unresolved && ownsRecord && !record?.hash;
  const matchesVerified = valid && ownsRecord && record?.status === 'confirmed'
    && String(record?.hash ?? '').toLowerCase() === hash.toLowerCase();
  const mode = hashlessPending ? 'attach' : matchesVerified ? 'recheck' : 'historical';
  return {
    disabled: Boolean(busy || !connected || !valid || (unresolved && !hashlessPending)),
    mode,
    label: mode === 'attach' ? 'Attach hash and verify'
      : mode === 'recheck' ? 'Recheck verified payment'
      : 'Verify previous payment'
  };
}

// Reconstruct only a REAL, matching settle transaction. A pasted hash is not
// itself a verification snapshot, and it must never authorize a payment.
// The strict calldata equality is checked against ABI-reencoded inputs by caller.
export function recoverySnapshot({ hash, transaction, parsed, encodedData,
  payer, contract, chainId, isAddress }) {
  const cleanHash = String(hash ?? '').trim();
  if (!validRecoveryHash(cleanHash)) throw new Error('Enter a valid 0x-prefixed transaction hash (64 hex characters).');
  if (!transaction || typeof transaction.data !== 'string') {
    throw new Error('Cannot retrieve the transaction calldata. Try a different Portaldot RPC or your original browser; no payment was sent.');
  }
  if (String(transaction.hash || '').toLowerCase() !== cleanHash.toLowerCase()) {
    throw new Error('The transaction hash returned by the provider does not match.');
  }
  if (String(transaction.from || '').toLowerCase() !== payer.toLowerCase()) {
    throw new Error('This payment was sent by a different wallet. Connect the original payer wallet.');
  }
  if (String(transaction.to || '').toLowerCase() !== contract.toLowerCase()) {
    throw new Error('This transaction was not sent to the configured Setlora contract.');
  }
  if (transaction.chainId == null || BigInt(transaction.chainId) !== BigInt(chainId)) {
    throw new Error('This transaction belongs to a different or unverified network.');
  }
  if (BigInt(transaction.value ?? 0n) !== 0n) {
    throw new Error('This transaction transferred native tokens; it is not a standard Setlora batch.');
  }
  if (parsed?.signature !== 'settle(uint256[],address[],uint256[])') {
    throw new Error('This transaction did not call Setlora batch settlement.');
  }
  if (typeof encodedData !== 'string' || transaction.data.toLowerCase() !== encodedData.toLowerCase()) {
    throw new Error('Transaction calldata cannot be validated against the Setlora batch ABI.');
  }
  const [numbers, recipients, amounts] = parsed.args || [];
  if (!Array.isArray(numbers) || !Array.isArray(recipients) || !Array.isArray(amounts)
      || numbers.length < 1 || numbers.length > MAX_INVOICES
      || numbers.length !== recipients.length || numbers.length !== amounts.length) {
    throw new Error('The transaction has an invalid batch size or mismatched invoice arrays.');
  }
  const seen = new Set();
  const items = numbers.map((number, i) => {
    const invoice = BigInt(number), amount = BigInt(amounts[i]);
    const recipient = String(recipients[i]);
    if (invoice <= 0n || invoice > UINT256_MAX || seen.has(invoice.toString())) {
      throw new Error('Invalid or duplicate invoice number in historical transaction.');
    }
    seen.add(invoice.toString());
    if (amount <= 0n || amount > UINT256_MAX || !isAddress(recipient)
        || /^0x0{40}$/i.test(recipient)) {
      throw new Error('Invalid recipient or amount in historical transaction.');
    }
    return { invoice: invoice.toString(), recipient, amount: amount.toString() };
  });
  return {
    hash: cleanHash, chainId: String(chainId), contract, payer,
    items, status: 'unknown',
    message: 'Historical batch found. Checking the receipt, exact invoice events and settlement flags.'
  };
}
