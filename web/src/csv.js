// CSV import intentionally restricted to four plaintext columns.
// Quoted fields and escaped quotation marks are supported.
export function parseCsv(source) {
  const lines = []; let row = []; let field = ''; let quoted = false;
  const text = String(source).replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i+1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') { quoted = true; }
    else if (c === ',') { row.push(field.trim()); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i+1] === '\n') i++;
      row.push(field.trim()); field = '';
      if (row.some(Boolean)) lines.push(row);
      row = [];
    } else field += c;
  }
  if (quoted) throw new Error('Unclosed quoted field in CSV');
  row.push(field.trim());
  if (row.some(Boolean)) lines.push(row);
  if (!lines.length) throw new Error('CSV is empty');
  const header = lines.shift().map(x => x.toLowerCase().replace(/\s+/g, ''));
  const required = ['invoice', 'recipient', 'amount'];
  if (!required.every(h => header.includes(h))) {
    throw new Error('CSV headers must include invoice,recipient,amount');
  }
  if (lines.length === 0) throw new Error('CSV contains no invoice rows');
  if (lines.length > 10) throw new Error('Maximum 10 invoices per batch');
  return lines.map((cells, idx) => {
    if (cells.length !== header.length) throw new Error(`CSV row ${idx + 2} has the wrong number of columns`);
    const obj = Object.fromEntries(header.map((k, i) => [k, cells[i]]));
    return { invoice: obj.invoice, recipient: obj.recipient, amount: obj.amount, note: obj.note || '' };
  });
}
