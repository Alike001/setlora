import { ethers } from 'ethers';
import { RPC, CHAIN_ID, TOKEN, CONTRACT_ADDRESS, CONTRACT_ABI, ERC20_ABI } from './config.js';
import { assessSettlementProof, matchesTransactionIntent } from './status.js';
import { recoverySnapshot, validRecoveryHash } from './recovery.js';
import { checkRecipientReadiness } from './readiness.js';
import { walletState, verifiedWallet, verifiedSigner } from './wallet-network.js';

export const read = new ethers.JsonRpcProvider(RPC, Number(CHAIN_ID), { staticNetwork: true });
export const tokenRead = new ethers.Contract(TOKEN, ERC20_ABI, read);
export const batchRead = CONTRACT_ADDRESS && ethers.isAddress(CONTRACT_ADDRESS)
  ? new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, read) : null;

export async function connect(injectedProvider) {
  // Observe changes before opening the explicit account-access prompt.
  const state = walletState(injectedProvider);
  await injectedProvider.request({ method: 'eth_requestAccounts' });
  return verifiedWallet(injectedProvider, CHAIN_ID, null, state);
}

export async function restoreWallet(injectedProvider, expectedAddress) {
  return verifiedWallet(injectedProvider, CHAIN_ID, expectedAddress);
}

// Fresh raw identity checks and an event revision guard, independent of ethers'
// previous-network return value. No permission prompt or network switch here.
export async function assertActiveWallet(wallet, expectedAddress, injectedProvider) {
  return verifiedSigner(wallet, expectedAddress, injectedProvider, CHAIN_ID);
}

export async function readWallet(address) {
  if (!batchRead) return { configured: false };
  const bytecode = await read.getCode(CONTRACT_ADDRESS);
  if (bytecode === '0x') throw new Error('No contract bytecode at the configured address. Settlement is disabled.');
  // Independent read-only calls can run together once contract code exists.
  // Validate the immutable token and decimals before exposing the result or
  // enabling any financial action. Any failed read fails the entire operation.
  const [actualToken, rawDecimals, balance, allowance] = await Promise.all([
    batchRead.token(),
    tokenRead.decimals(),
    tokenRead.balanceOf(address),
    tokenRead.allowance(address, CONTRACT_ADDRESS)
  ]);
  if (actualToken.toLowerCase() !== TOKEN.toLowerCase()) throw new Error('Configured payment token does not match contract.token().');
  const decimals = Number(rawDecimals);
  if (decimals !== 6) throw new Error(`Unexpected token decimals (${decimals}); pUSD settlement is disabled.`);
  return { configured: true, decimals, balance, allowance };
}

export async function checkAlreadySettled(address, items) {
  if (!batchRead) throw new Error('Setlora contract has not been configured.');
  const status = await Promise.all(items.map(x => batchRead.isSettled(address, x.invoice)));
  return items.filter((_, i) => status[i]).map(x => x.invoice.toString());
}

// Simulate each transfer from the payer without signing or using allowance.
// This detects Token(CannotCreate) on the V3 asset precompile before approval.
// Passing individual checks does not guarantee an entire batch will settle.
const transferInterface = new ethers.Interface(['function transfer(address,uint256) returns (bool)']);
export async function preflightRecipients(payer, items) {
  if (!ethers.isAddress(payer)) throw new Error('Connect the correct paying wallet first.');
  return checkRecipientReadiness(items, async item => {
    const data = transferInterface.encodeFunctionData('transfer', [item.recipient, item.amount]);
    const result = await read.call({ to: TOKEN, from: payer, data });
    const decoded = transferInterface.decodeFunctionResult('transfer', result);
    return decoded[0] === true;
  });
}

export async function preflightWholeBatch(payer, items) {
  if (!batchRead) throw new Error('Setlora contract is not configured.');
  // This is eth_estimateGas only. The wallet is NOT asked to sign or broadcast.
  // It tests the actual delegated, atomic settlement path with current allowance.
  return batchRead.settle.estimateGas(
    items.map(x => x.invoice), items.map(x => x.recipient), items.map(x => x.amount),
    { from: payer }
  );
}

export async function approveExactAmount(wallet, total, expectedAddress, injectedProvider) {
  const signer = await assertActiveWallet(wallet, expectedAddress, injectedProvider);
  return await (new ethers.Contract(TOKEN, ERC20_ABI, signer)).approve(CONTRACT_ADDRESS, total);
}

export async function sendBatch(wallet, items, expectedAddress, injectedProvider) {
  const signer = await assertActiveWallet(wallet, expectedAddress, injectedProvider);
  const batch = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  return await batch.settle(items.map(x => x.invoice), items.map(x => x.recipient), items.map(x => x.amount));
}

// Verify an already-submitted payment using only public chain data.
// Never request accounts, send transactions, sign, or set allowances here.
export async function recoverHistoricalSettlement(hash, payer, injectedProvider = null) {
  if (!batchRead) throw new Error('Setlora contract is not configured.');
  if (!validRecoveryHash(hash)) throw new Error('Enter a complete transaction hash.');
  const sources = [read];
  if (injectedProvider?.request) {
    try {
      const walletChain = await injectedProvider.request({ method: 'eth_chainId' });
      if (BigInt(walletChain) === CHAIN_ID) sources.push(new ethers.BrowserProvider(injectedProvider, 'any'));
    } catch { /* Wallet may be unavailable; configured RPC is the primary source. */ }
  }
  let tx = null;
  for (const source of sources) {
    try { tx = await source.getTransaction(hash); } catch { /* Try next read-only source. */ }
    if (tx) break;
  }
  if (!tx) throw new Error('Transaction details are unavailable from the current RPCs. No payment was sent. Try the original browser or retry later.');
  let parsed = null;
  try { parsed = batchRead.interface.parseTransaction({ data: tx.data, value: tx.value }); }
  catch { /* recoverySnapshot will reject unrelated or unparseable calldata. */ }
  let encodedData = null;
  if (parsed?.signature === 'settle(uint256[],address[],uint256[])') {
    try { encodedData = batchRead.interface.encodeFunctionData('settle', [parsed.args[0], parsed.args[1], parsed.args[2]]); }
    catch { /* recoverySnapshot will reject malformed calldata. */ }
  }
  return recoverySnapshot({ hash, transaction: tx, parsed, encodedData,
    payer, contract: CONTRACT_ADDRESS, chainId: CHAIN_ID, isAddress: ethers.isAddress });
}

export async function verifySettlement(hash, payer, items, injectedProvider = null) {
  if (!batchRead) throw new Error('No verified Setlora contract configured.');
  const expectedData = batchRead.interface.encodeFunctionData('settle', [
    items.map(x => x.invoice), items.map(x => x.recipient), items.map(x => x.amount)
  ]);

  // The RPC may return a receipt even when eth_getTransactionByHash is null.
  // Query both independently, and optionally try the selected wallet's V3 RPC.
  // No blockchain write or wallet signing is performed here.
  const sources = [read];
  if (injectedProvider?.request) {
    try {
      const walletChain = await injectedProvider.request({ method: 'eth_chainId' });
      if (BigInt(walletChain) === CHAIN_ID) sources.push(new ethers.BrowserProvider(injectedProvider, 'any'));
    } catch { /* Never trust an unavailable or wrong-chain fallback. */ }
  }
  let receipt = null; let transaction = null; let receiptSource = null;
  const readErrors = [];
  for (const source of sources) {
    const [txResult, receiptResult] = await Promise.allSettled([
      source.getTransaction(hash), source.getTransactionReceipt(hash)
    ]);
    if (txResult.status === 'fulfilled' && txResult.value) transaction ||= txResult.value;
    if (txResult.status === 'rejected') readErrors.push(txResult.reason?.message || 'transaction lookup failed');
    if (receiptResult.status === 'rejected') readErrors.push(receiptResult.reason?.message || 'receipt lookup failed');
    if (receiptResult.status === 'fulfilled' && receiptResult.value) {
      receipt = receiptResult.value; receiptSource = source; break;
    }
  }
  if (transaction && !matchesTransactionIntent(transaction, payer, CONTRACT_ADDRESS, expectedData, CHAIN_ID)) {
    return { status: 'mismatch', reason: 'Transaction sender, contract, chain or calldata differs from the saved batch.' };
  }
  if (!receipt) {
    // Useful diagnosis, NOT a substitute for a receipt or proof of amounts.
    let flags = '';
    try {
      const paid = await checkAlreadySettled(payer, items);
      flags = ` On-chain invoice flags: ${paid.length}/${items.length} settled.`;
    } catch { flags = ' Invoice flags could not be checked.'; }
    return { status: 'unknown', reason:
      `Receipt unavailable from checked providers.${flags} Do not resend. Use transaction recovery or retry verification later.${readErrors.length ? ' A provider lookup failed.' : ''}` };
  }

  let block = null;
  try { block = await receiptSource.getBlock(receipt.blockNumber); }
  catch { /* Keep unknown rather than bypassing canonical-block check. */ }
  const invoiceEvents = []; let batchEvent = null;
  for (const log of receipt.logs || []) {
    if (!log.address || log.address.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) continue;
    try {
      const parsed = batchRead.interface.parseLog(log);
      if (parsed?.name === 'InvoiceSettled') {
        invoiceEvents.push({ payer: parsed.args.payer, invoice: parsed.args.invoiceNumber,
          recipient: parsed.args.recipient, amount: parsed.args.amount });
      }
      if (parsed?.name === 'BatchSettled') {
        batchEvent = { payer: parsed.args.payer, count: parsed.args.count, total: parsed.args.total };
      }
    } catch { /* Ignore irrelevant event logs from the same contract. */ }
  }
  // Never mark confirmed if this state query fails: we need all three pieces
  // of evidence (successful receipt, exact events, paid state).
  let settled = [];
  if (receipt.status === 1 || receipt.status === 1n) {
    try { settled = await checkAlreadySettled(payer, items); }
    catch { return { status: 'unknown', reason: 'Receipt available, but settled invoice flags could not be checked.' }; }
  }
  const proof = assessSettlementProof({ receipt, transaction, hash, payer, contract: CONTRACT_ADDRESS,
    expectedData, chainId: CHAIN_ID, block, invoiceEvents, batchEvent, items, settled });
  return { ...proof, receipt };
}
