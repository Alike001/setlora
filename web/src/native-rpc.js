// Read-only Substrate storage lookup. No signAndSend, tx or extension connections.
import { ApiPromise, WsProvider } from '@polkadot/api';
import { decodeAddress, encodeAddress } from '@polkadot/util-crypto';
import { getAddress } from 'ethers';
import {
  ASSET_ID, EVM_HEX, mappedEvmHexFromAccountId,
  mapEvmHexToAccountId, summarizeNativeAccount,
} from './native-account.js';

const ENDPOINT = 'wss://test-node-v3.portaldot.dev';
const TIMEOUT_MS = 18000;
const timeLimit = (promise, ms) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Native RPC timed out. Try again later.')), ms); })
  ]).finally(() => clearTimeout(timer));
};

export function resolveRecipientAddress(input) {
  const value = String(input || '').trim();
  if (!value) throw new Error('Enter a native 5… address or an EVM 0x… address.');
  let bytes;
  let kind;
  let evm = null;
  if (EVM_HEX.test(value)) {
    evm = getAddress(value); // Reject invalid EIP-55 mixed-case checksum.
    bytes = mapEvmHexToAccountId(evm);
    kind = 'EVM-derived native representation';
  } else {
    try { bytes = decodeAddress(value); } catch { throw new Error('Invalid SS58 address or checksum.'); }
    if (bytes.length !== 32) throw new Error('Expected a 32-byte native account.');
    const mapped = mappedEvmHexFromAccountId(bytes);
    if (mapped) {
      evm = getAddress(mapped);
      kind = 'EVM-derived native representation';
    } else {
      kind = 'Native AccountId32';
    }
  }
  return { address: encodeAddress(bytes, 42), bytes, kind, evm };
}

const str = value => value?.toString?.() ?? '0';
const human = value => value?.toString?.() ?? '';

export async function queryNativeRecipient(input) {
  const resolved = resolveRecipientAddress(input);
  const ws = new WsProvider(ENDPOINT, 1000);
  let api;
  try {
    api = new ApiPromise({ provider: ws, noInitWarn: true });
    await timeLimit(api.isReady, TIMEOUT_MS);
    if (!api.query?.assets?.account || !api.query?.assets?.asset || !api.query?.assets?.metadata || !api.query?.system?.account)
      throw new Error('Portaldot V3 RPC does not expose the expected Assets and System storage.');
    const [assetRaw, systemRaw, detailsRaw, metadataRaw] = await timeLimit(Promise.all([
      api.query.assets.account(ASSET_ID, resolved.address),
      api.query.system.account(resolved.address),
      api.query.assets.asset(ASSET_ID),
      api.query.assets.metadata(ASSET_ID),
    ]), TIMEOUT_MS);
    const asset = assetRaw.isSome ? assetRaw.unwrap() : null;
    const details = detailsRaw.isSome ? detailsRaw.unwrap() : null;
    const md = metadataRaw;
    const result = {
      address: resolved.address, kind: resolved.kind, evm: resolved.evm,
      rpc: ENDPOINT, network: str(await timeLimit(api.rpc.system.chain(), TIMEOUT_MS)),
      block: str(await timeLimit(api.query.system.number(), TIMEOUT_MS)),
      asset: asset ? { balance: str(asset.balance), status: human(asset.status), reason: human(asset.reason) } : null,
      system: { nonce: str(systemRaw.nonce), providers: str(systemRaw.providers), sufficients: str(systemRaw.sufficients), consumers: str(systemRaw.consumers), free: str(systemRaw.data.free) },
      details: details ? { status: human(details.status), minBalance: str(details.minBalance), isSufficient: details.isSufficient.isTrue } : null,
      metadata: { symbol: md.symbol.toUtf8(), decimals: md.decimals.toNumber() },
      checkedAt: new Date().toISOString(),
    };
    result.assessment = summarizeNativeAccount(result);
    return result;
  } finally {
    try { if (api) await api.disconnect(); else await ws.disconnect(); } catch { /* cleanup only */ }
  }
}
