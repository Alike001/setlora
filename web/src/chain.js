import { ethers } from 'ethers';
import { RPC, CHAIN_ID, CHAIN_ID_HEX, TOKEN, CONTRACT_ADDRESS, CONTRACT_ABI, ERC20_ABI } from './config.js';
import { matchesSettlementEvents } from './invoice.js';

export const read = new ethers.JsonRpcProvider(RPC, Number(CHAIN_ID), { staticNetwork: true });
export const tokenRead = new ethers.Contract(TOKEN, ERC20_ABI, read);
export const batchRead = CONTRACT_ADDRESS && ethers.isAddress(CONTRACT_ADDRESS)
  ? new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, read) : null;

export async function connect() {
  if (!window.ethereum) throw new Error('Install or open MetaMask to connect your wallet.');
  const wallet = new ethers.BrowserProvider(window.ethereum);
  await wallet.send('eth_requestAccounts', []);
  let network = await wallet.getNetwork();
  if (network.chainId !== CHAIN_ID) {
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
    } catch (e) {
      if (e.code !== 4902) throw e;
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: CHAIN_ID_HEX, chainName: 'Portaldot V3 Testnet', rpcUrls: [RPC], nativeCurrency: { name: 'Test POT', symbol: 'tPOTv3', decimals: 18 } }] });
    }
    network = await wallet.getNetwork();
  }
  if (network.chainId !== CHAIN_ID) throw new Error('Wallet is on the wrong network. Switch to Portaldot V3.');
  return { wallet, address: await (await wallet.getSigner()).getAddress() };
}

export async function readWallet(address) {
  if (!batchRead) return { configured: false };
  const bytecode = await read.getCode(CONTRACT_ADDRESS);
  if (bytecode === '0x') throw new Error('No contract bytecode at the configured address. Settlement is disabled.');
  const actualToken = await batchRead.token();
  if (actualToken.toLowerCase() !== TOKEN.toLowerCase()) throw new Error('Configured payment token does not match contract.token().');
  const decimals = Number(await tokenRead.decimals());
  if (decimals !== 6) throw new Error(`Unexpected token decimals (${decimals}); pUSD settlement is disabled.`);
  const [balance, allowance] = await Promise.all([tokenRead.balanceOf(address), tokenRead.allowance(address, CONTRACT_ADDRESS)]);
  return { configured: true, decimals, balance, allowance };
}

export async function checkAlreadySettled(address, items) {
  if (!batchRead) throw new Error('Setlora contract has not been configured.');
  const status = await Promise.all(items.map(x => batchRead.isSettled(address, x.invoice)));
  return items.filter((_, i) => status[i]).map(x => x.invoice.toString());
}

export async function approveExactAmount(wallet, total) {
  const signer = await wallet.getSigner();
  return await (new ethers.Contract(TOKEN, ERC20_ABI, signer)).approve(CONTRACT_ADDRESS, total);
}

export async function sendBatch(wallet, items) {
  const signer = await wallet.getSigner();
  const batch = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  return await batch.settle(items.map(x => x.invoice), items.map(x => x.recipient), items.map(x => x.amount));
}

export async function verifySettlement(hash, payer, items) {
  const receipt = await read.getTransactionReceipt(hash);
  if (!receipt) return { status: 'unknown', reason: 'Receipt not found yet. Do not resend; check again later.' };
  if (receipt.status !== 1) return { status: 'failed', reason: 'Transaction receipt reports status 0 (reverted).', receipt };
  if (!batchRead || !receipt.to || receipt.to.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()
     || receipt.from.toLowerCase() !== payer.toLowerCase()) {
    return { status: 'mismatch', reason: 'Receipt sender or destination does not match the expected Setlora transaction.', receipt };
  }
  const events = []; let batchEvent = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) continue;
    try {
      const parsed = batchRead.interface.parseLog(log);
      if (parsed?.name === 'InvoiceSettled') events.push({ payer: parsed.args.payer, invoice: parsed.args.invoiceNumber, recipient: parsed.args.recipient, amount: parsed.args.amount });
      if (parsed?.name === 'BatchSettled') batchEvent = { payer: parsed.args.payer, count: parsed.args.count, total: parsed.args.total };
    } catch { /* irrelevant log */ }
  }
  const expectedTotal = items.reduce((sum, x) => sum + x.amount, 0n);
  if (!matchesSettlementEvents(events, payer, items) || !batchEvent || batchEvent.payer.toLowerCase() !== payer.toLowerCase()
    || batchEvent.count !== BigInt(items.length) || batchEvent.total !== expectedTotal) {
    return { status: 'mismatch', reason: 'Receipt succeeded, but expected invoice events do not match. Investigate before retrying.', receipt };
  }
  const paid = await checkAlreadySettled(payer, items);
  if (paid.length !== items.length) return { status: 'unknown', reason: 'Events matched, but not all on-chain settlement flags could be confirmed. Investigate.', receipt };
  return { status: 'confirmed', reason: `Verified ${items.length} invoice settlement event(s), batch totals, and on-chain flags.`, receipt };
}
