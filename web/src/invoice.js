export const MAX_INVOICES = 10;
export const UINT256_MAX = (1n << 256n) - 1n;

export function parseUnitsExact(value, decimals = 6) {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error('Enter a positive decimal amount');
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > decimals) throw new Error(`Only ${decimals} decimal places are supported`);
  const n = BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction || '').padEnd(decimals, '0') || '0');
  if (n <= 0n || n > UINT256_MAX) throw new Error('Amount must be positive and within token limits');
  return n;
}

export function validateInvoices(rows, isAddress, decimals = 6) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_INVOICES) {
    throw new Error(`Add between 1 and ${MAX_INVOICES} invoices`);
  }
  const seen = new Set();
  const clean = rows.map((row, idx) => {
    const id = String(row.invoice ?? '').trim();
    if (!/^\d+$/.test(id) || BigInt(id) < 1n || BigInt(id) > UINT256_MAX) {
      throw new Error(`Invoice ${idx + 1}: invoice number must be a positive integer`);
    }
    const canonicalId = BigInt(id).toString();
    if (seen.has(canonicalId)) throw new Error(`Invoice ${idx + 1}: repeated invoice number ${id}`);
    seen.add(canonicalId);
    const recipient = String(row.recipient ?? '').trim();
    if (!isAddress(recipient) || /^0x0{40}$/i.test(recipient)) {
      throw new Error(`Invoice ${idx + 1}: invalid recipient address`);
    }
    let amount;
    try { amount = parseUnitsExact(row.amount, decimals); }
    catch (error) { throw new Error(`Invoice ${idx + 1}: ${error.message}`); }
    return { invoice: BigInt(id), recipient, amount, note: String(row.note || '').slice(0, 100) };
  });
  return { items: clean, total: clean.reduce((a, b) => a + b.amount, 0n) };
}

export function matchesSettlementEvents(events, payer, items) {
  if (events.length !== items.length) return false;
  const expected = new Map(items.map(x => [x.invoice.toString(), x]));
  if (expected.size !== items.length) return false;
  for (const e of events) {
    if (String(e.payer).toLowerCase() !== payer.toLowerCase()) return false;
    const item = expected.get(BigInt(e.invoice).toString());
    if (!item || String(e.recipient).toLowerCase() !== item.recipient.toLowerCase() || BigInt(e.amount) !== item.amount) return false;
    expected.delete(BigInt(e.invoice).toString());
  }
  return expected.size === 0;
}
