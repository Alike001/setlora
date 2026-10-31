// Browser-local index of VERIFIED Setlora settlements. A stored record is not
// independent proof: every historical receipt must be rechecked on-chain before
// the app presents it as freshly verified or offers a download.
const HASH = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MAX_ENTRIES = 30;
const uint = value => /^(0|[1-9][0-9]*)$/.test(String(value));
export function historyKey(chainId, contract, payer) {
  if (!ADDRESS.test(String(contract)) || !ADDRESS.test(String(payer)) || !uint(chainId)) return null;
  return `setlora:history:v1:${String(chainId)}:${contract.toLowerCase()}:${payer.toLowerCase()}`;
}
export function validHistoryEntry(record, chainId, contract, payer) {
  if (!record || record.status !== 'confirmed' || !HASH.test(record.hash || '')) return false;
  if (!ADDRESS.test(String(record.contract)) || record.contract.toLowerCase() !== String(contract).toLowerCase()) return false;
  if (!ADDRESS.test(String(record.payer)) || record.payer.toLowerCase() !== String(payer).toLowerCase()) return false;
  if (String(record.chainId) !== String(chainId) || !uint(chainId)) return false;
  if (!Array.isArray(record.items) || record.items.length < 1 || record.items.length > 10) return false;
  const seen = new Set();
  for (const item of record.items) {
    if (!uint(item.invoice) || BigInt(item.invoice) < 1n || !uint(item.amount) || BigInt(item.amount) < 1n
       || !ADDRESS.test(String(item.recipient)) || /^0x0{40}$/i.test(item.recipient)) return false;
    if (seen.has(String(BigInt(item.invoice)))) return false;
    seen.add(String(BigInt(item.invoice)));
  }
  return true;
}
function safeRecord(record) {
  // Store only public transfer evidence (not wallet objects or private metadata).
  return {
    hash: record.hash,
    chainId: String(record.chainId),
    contract: record.contract, payer: record.payer,
    status: 'confirmed',
    items: record.items.map(({invoice,recipient,amount})=>({
      invoice:String(invoice), recipient:String(recipient), amount:String(amount) })),
    checkedAt: Number.isFinite(Date.parse(record.checkedAt || '')) ? new Date(record.checkedAt).toISOString() : null,
  };
}
export function readHistory(storage, chainId, contract, payer) {
  const key=historyKey(chainId,contract,payer);
  if (!key) return [];
  try {
    const raw=JSON.parse(storage.getItem(key) || '[]');
    if (!Array.isArray(raw)) return [];
    const seen=new Set();
    return raw.filter(entry=>{
      if (!validHistoryEntry(entry,chainId,contract,payer)) return false;
      const id=entry.hash.toLowerCase();
      if (seen.has(id)) return false;
      seen.add(id); return true;
    }).slice(0,MAX_ENTRIES).map(safeRecord);
  } catch { return []; }
}
export function addVerifiedHistory(storage, chainId, contract, payer, record) {
  if (!validHistoryEntry(record,chainId,contract,payer)) return false;
  const key=historyKey(chainId,contract,payer);
  if (!key) return false;
  try {
    const existing=readHistory(storage,chainId,contract,payer);
    const clean=safeRecord(record);
    const next=[clean,...existing.filter(x=>x.hash.toLowerCase()!==clean.hash.toLowerCase())].slice(0,MAX_ENTRIES);
    storage.setItem(key,JSON.stringify(next));
    return true;
  } catch { return false; }
}
export function totalHistoryAmount(record) {
  return record.items.reduce((sum,item)=>sum+BigInt(item.amount),0n);
}
