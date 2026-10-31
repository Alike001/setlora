// Read-only, wallet-neutral checks. No signatures or funds move here.
// Never equate a zero native balance with recipient ineligibility; the token
// simulation is the useful preflight, not the displayed gas-token balance.
export function explainRecipientFailure(error) {
  const message = String(error?.shortMessage || error?.reason || error?.message || error || 'Unknown RPC error');
  if (/CannotCreate|UnavailableConsumer|NoProvider/i.test(message))
    return 'This recipient may need an active Portaldot native account before receiving pUSD. Check their mapped native account, complete setup if needed, then review again.';
  if (/min.*balance|BelowMinimum|WouldDie/i.test(message))
    return 'The token operation may violate the asset minimum-balance requirement. Check the recipient and amount before retrying.';
  if (/insufficient|BalanceLow|FundsUnavailable/i.test(message))
    return 'The token simulation reports insufficient funds. Check the payer balance and proposed payment amounts.';
  if (/timeout|network|RPC|unavailable|fetch|429|503/i.test(message))
    return 'The network could not reliably check this recipient. Nothing was sent. Please retry Review when the network is available.';
  return 'The network could not simulate this payment. Check the recipient address and account eligibility; do not approve until Review succeeds.';
}

export async function checkRecipientReadiness(items, simulate) {
  if (!Array.isArray(items) || !items.length || typeof simulate !== 'function')
    throw new Error('A valid invoice batch and read-only transfer simulator are required.');
  const checks = [];
  // Sequential calls reduce load on fragile testnet RPCs and preserve per-item errors.
  for (const item of items) {
    try {
      const allowed = await simulate(item);
      if (allowed !== true) throw new Error('Transfer simulation returned false');
      checks.push({ invoice: String(item.invoice), recipient: item.recipient, status: 'ready' });
    } catch (error) {
      checks.push({ invoice: String(item.invoice), recipient: item.recipient,
        status: 'blocked', message: explainRecipientFailure(error) });
    }
  }
  return { ready: checks.every(c => c.status === 'ready'), checks };
}
