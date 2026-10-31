import { ethers } from 'ethers';
import { MAX_INVOICES } from './invoice.js';
import { validRecoveryHash } from './recovery.js';

// Recover expected invoice instructions ONLY from logs emitted by the configured
// Setlora contract. Nothing on this path can request a wallet or submit payment.
export function extractBatchFromReceipt(receipt, contract, iface) {
  if (!receipt || !ethers.isAddress(contract) ||
      String(receipt.to ?? '').toLowerCase() !== contract.toLowerCase() ||
      !ethers.isAddress(String(receipt.from ?? ''))) {
    throw new Error('Receipt is not from the configured Setlora contract.');
  }
  const payer = ethers.getAddress(receipt.from);
  const invoices = [];
  const batches = [];
  const seen = new Set();
  for (const log of receipt.logs || []) {
    if (String(log.address ?? '').toLowerCase() !== contract.toLowerCase()) continue;
    let event;
    try { event = iface.parseLog({ topics: log.topics, data: log.data }); }
    catch { throw new Error('An unrecognized Setlora contract event was encountered.'); }
    if (!event) throw new Error('An unrecognized Setlora contract event was encountered.');
    if (event.name === 'InvoiceSettled') {
      const id = BigInt(event.args.invoiceNumber);
      const amount = BigInt(event.args.amount);
      const recipient = String(event.args.recipient);
      if (id <= 0n || amount <= 0n || !ethers.isAddress(recipient) ||
          recipient.toLowerCase() === ethers.ZeroAddress.toLowerCase() ||
          String(event.args.payer).toLowerCase() !== payer.toLowerCase() ||
          seen.has(id.toString())) throw new Error('Invalid or repeated invoice event.');
      seen.add(id.toString());
      invoices.push({ invoice: id, recipient, amount });
    } else if (event.name === 'BatchSettled') {
      batches.push(event);
    } else {
      throw new Error('Unexpected Setlora contract event.');
    }
  }
  if (invoices.length < 1 || invoices.length > MAX_INVOICES || batches.length !== 1) {
    throw new Error('Receipt does not contain exactly one valid batch with 1–10 invoices.');
  }
  const batch = batches[0];
  const total = invoices.reduce((sum, item) => sum + item.amount, 0n);
  if (String(batch.args.payer).toLowerCase() !== payer.toLowerCase() ||
      BigInt(batch.args.count) !== BigInt(invoices.length) ||
      BigInt(batch.args.total) !== total) {
    throw new Error('Batch event does not match the invoice events or payer.');
  }
  return { payer, items: invoices, total };
}

export async function verifyPublicPayment(value) {
  const hash = String(value ?? '').trim();
  if (!validRecoveryHash(hash)) throw new Error('Enter a complete 0x-prefixed transaction hash.');

  // Dynamic import keeps the pure evidence parser unit-testable in Node without
  // requiring Vite's import.meta.env at test time.
  const [{ read, batchRead, tokenRead, verifySettlement }, config] = await Promise.all([
    import('./chain.js'), import('./config.js')
  ]);
  if (!batchRead || !ethers.isAddress(config.CONTRACT_ADDRESS)) {
    throw new Error('Setlora testnet settlement contract is not configured.');
  }
  const currentChain = await read.send('eth_chainId', []);
  if (BigInt(currentChain) !== config.CHAIN_ID) throw new Error('RPC returned the wrong network.');
  const [code, actualToken, decimals] = await Promise.all([
    read.getCode(config.CONTRACT_ADDRESS), batchRead.token(), tokenRead.decimals()
  ]);
  if (code === '0x' || actualToken.toLowerCase() !== config.TOKEN.toLowerCase() ||
      BigInt(decimals) !== 6n) throw new Error('The deployed contract or pUSD token does not match the expected testnet configuration.');

  const receipt = await read.getTransactionReceipt(hash);
  if (!receipt) throw new Error('Transaction receipt is unavailable. Nothing has been verified. Retry later.');
  if (String(receipt.hash || '').toLowerCase() !== hash.toLowerCase()) {
    throw new Error('The RPC returned a different transaction hash.');
  }
  if (receipt.status !== 1 && receipt.status !== 1n) {
    throw new Error('No successful Setlora settlement receipt was found for this transaction.');
  }

  const intent = extractBatchFromReceipt(receipt, config.CONTRACT_ADDRESS, batchRead.interface);
  // REUSE the same checks as the payment workspace: receipt + exact event match
  // + canonical block + settlement flags, with transaction calldata if available.
  const verification = await verifySettlement(hash, intent.payer, intent.items);
  return {
    hash, contract: config.CONTRACT_ADDRESS,
    blockNumber: receipt.blockNumber,
    payer: intent.payer, items: intent.items, total: intent.total,
    status: verification.status, reason: verification.reason
  };
}
