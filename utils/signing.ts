import { createWalletClient, http, recoverTypedDataAddress, keccak256, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const EIP712_DOMAIN = {
  name: 'AdMarket',
  version: '1',
  chainId: 84532, // Base Sepolia
} as const;

export interface SignatureVerificationOptions {
  maxAgeMs?: number;
  maxFutureSkewMs?: number;
  requireTimestamp?: boolean;
}

export async function signMessage(
  payload: object,
  privateKey: `0x${string}`
): Promise<string> {
  const account = privateKeyToAccount(privateKey);
  const client = createWalletClient({ 
    account, 
    chain: baseSepolia, 
    transport: http() 
  });

  return client.signTypedData({
    domain: EIP712_DOMAIN,
    types: {
      Message: [{ name: 'hash', type: 'bytes32' }],
    },
    primaryType: 'Message',
    message: {
      hash: hashPayload(payload),
    },
  });
}

export function hashPayload(payload: object): `0x${string}` {
  // Filter out signature if it exists in the payload to avoid circular dependency
  const { signature, ...rest } = payload as any;
  return keccak256(toBytes(stableStringify(rest)));
}

export async function verifySignature(
  payload: object,
  signature: string,
  expectedSigner: string,
  options: SignatureVerificationOptions = {}
): Promise<boolean> {
  if (!isFreshSignedPayload(payload, options)) return false;

  try {
    const recovered = await recoverTypedDataAddress({
      domain: EIP712_DOMAIN,
      types: { Message: [{ name: 'hash', type: 'bytes32' }] },
      primaryType: 'Message',
      message: { hash: hashPayload(payload) },
      signature: signature as `0x${string}`,
    });
    return recovered.toLowerCase() === expectedSigner.toLowerCase();
  } catch {
    return false;
  }
}

export function isFreshSignedPayload(
  payload: object,
  options: SignatureVerificationOptions = {}
): boolean {
  const {
    maxAgeMs = 5 * 60 * 1000,
    maxFutureSkewMs = 30 * 1000,
    requireTimestamp = false,
  } = options;
  const timestamp = (payload as any).timestamp;

  if (timestamp === undefined || timestamp === null) return !requireTimestamp;
  if (!Number.isFinite(Number(timestamp))) return false;

  const age = Date.now() - Number(timestamp);
  return age <= maxAgeMs && age >= -maxFutureSkewMs;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'bigint') return JSON.stringify(value.toString());
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}
