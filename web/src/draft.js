// Wallet-scoped, browser-only invoice drafts. Never include signing material.
export const EMPTY_ROW = { invoice: '', recipient: '', amount: '', note: '' };
export function draftStorageKey(chainId, contract, address) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(address)) || !/^0x[0-9a-fA-F]{40}$/.test(String(contract))) {
    throw new Error('Draft wallet or contract address is invalid');
  }
  return `setlora:draft:v1:${String(chainId)}:${contract.toLowerCase()}:${address.toLowerCase()}`;
}
export function hasDraftContent(rows) {
  return Array.isArray(rows) && rows.some(row => ['invoice', 'recipient', 'amount', 'note'].some(field => String(row?.[field] ?? '').trim()));
}
export function sanitizedDraftRows(rows) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 10) return null;
  const output = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    const clean = {};
    for (const field of ['invoice','recipient','amount','note']) {
      if (typeof row[field] !== 'string') return null;
      if (row[field].length > (field === 'note' ? 100 : 128)) return null;
      clean[field] = row[field];
    }
    output.push(clean);
  }
  return output;
}
export function loadDraft(storage, key) {
  try {
    const saved = storage.getItem(key);
    if (!saved) return null;
    const result = JSON.parse(saved);
    if (result?.version !== 1) return null;
    return sanitizedDraftRows(result.rows);
  } catch { return null; }
}
export function saveDraft(storage, key, rows) {
  const clean = sanitizedDraftRows(rows);
  if (!clean) throw new Error('Draft rows failed validation');
  if (!hasDraftContent(clean)) { storage.removeItem(key); return false; }
  storage.setItem(key, JSON.stringify({ version: 1, rows: clean }));
  return true;
}
