// Data-only helpers for Portaldot V3 AccountId32 inspection. No signing APIs.
export const ASSET_ID = 7777;
export const EXPECTED_DECIMALS = 6;
export const EXPECTED_SYMBOL = 'pUSD';
export const EVM_HEX = /^0x[\da-fA-F]{40}$/;
export const SS58_EVM_SUFFIX = 'ee'.repeat(12);

export function formatAssetUnits(units, decimals = 6) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new Error('Unsupported decimals');
  const n = BigInt(String(units));
  if (n < 0n) throw new Error('Negative amount');
  const scale = 10n ** BigInt(decimals);
  const whole = (n / scale).toString();
  const fraction = (n % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

export function mappedEvmHexFromAccountId(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) return null;
  for (let i = 20; i < 32; i++) if (bytes[i] !== 0xee) return null;
  return '0x' + Array.from(bytes.slice(0, 20), x => x.toString(16).padStart(2, '0')).join('');
}

export function mapEvmHexToAccountId(evm) {
  if (!EVM_HEX.test(evm)) throw new Error('Enter a 20-byte EVM address.');
  const out = new Uint8Array(32).fill(0xee, 20);
  for (let i = 0; i < 20; i++) out[i] = Number.parseInt(evm.slice(2 + 2 * i, 4 + 2 * i), 16);
  return out;
}

// Inspect existence/asset records, NOT a guarantee of transfer success.
export function summarizeNativeAccount(data) {
  const { asset, system, details, metadata } = data;
  if (!details || details.status !== 'Live') {
    return { kind: 'unknown', label: 'Asset unavailable', help: 'The pUSD asset is not live or its configuration could not be verified.' };
  }
  if (!metadata || metadata.symbol !== EXPECTED_SYMBOL || metadata.decimals !== EXPECTED_DECIMALS) {
    return { kind: 'unknown', label: 'Unexpected asset metadata', help: 'The live asset metadata does not match Setlora’s expected pUSD token. No receiving claim can be made.' };
  }
  if (asset?.status && asset.status !== 'Liquid') {
    return { kind: 'blocked', label: 'Asset account restricted', help: `The asset account reports ${asset.status}. Check the asset account before receiving.` };
  }
  const systemExists = BigInt(system.providers) > 0n || BigInt(system.sufficients) > 0n;
  if (asset) {
    const balance = BigInt(asset.balance);
    if (balance < BigInt(details.minBalance)) {
      return { kind: 'unknown', label: 'Below asset minimum', help: 'The asset record is below the currently configured minimum. Check the live runtime.' };
    }
    return { kind: 'existing', label: 'Existing pUSD holder', help: 'Native asset storage confirms an existing liquid pUSD account. This is not a guarantee that a future transfer will succeed.' };
  }
  if (!systemExists) return { kind: 'setup', label: 'Account setup may be required', help: 'No system provider/sufficient reference and no pUSD asset account were found. This non-sufficient asset cannot maintain the account alone. A recipient-readiness transfer simulation is still needed.' };
  return { kind: 'unknown', label: 'pUSD account not found', help: 'The native system account exists, but this account has no pUSD record. Receiving may require an asset-account deposit or other setup. Do not send before a transfer-readiness check.' };
}
