import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import type { DealRecord } from '../types/deal';
import { cachePath } from './pathConfig';

export interface ProofBundleContext {
  sponsorMandate?: unknown;
  communityMandate?: unknown;
  reputationSources?: Record<string, unknown>;
  chain?: {
    name: string;
    chainId: number;
    escrowContract?: string;
    intentRegistry?: string;
  };
}

export interface ProofBundle {
  schemaVersion: 'admarket.proof.v1';
  proofId: string;
  generatedAt: number;
  dealId: string;
  phase: string;
  mandates: {
    sponsorHash?: string;
    communityHash?: string;
  };
  chain?: ProofBundleContext['chain'];
  reputationSources?: Record<string, unknown>;
  signedMessages: unknown[];
  policyTrail: DealRecord['policyTrail'];
  decisionReceipts: DealRecord['decisionReceipts'];
  events: DealRecord['events'];
  txHashes: string[];
  deliveryProof?: string;
  escrowId?: string;
  finalHash: string;
}

export function hashEvidence(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableStringify(value)).digest('hex')}`;
}

export function buildProofBundle(deal: DealRecord, context: ProofBundleContext = {}): ProofBundle {
  const signedMessages = deal.events
    .map((event) => event.payload)
    .filter((payload: any) => payload?.signature || payload?.request?.signature || payload?.offer?.signature || payload?.response?.signature);

  const unsignedBundle = {
    schemaVersion: 'admarket.proof.v1' as const,
    proofId: hashEvidence({
      dealId: deal.dealId,
      createdAt: deal.createdAt,
      events: deal.events.map((event) => `${event.timestamp}:${event.type}`),
    }),
    generatedAt: Date.now(),
    dealId: deal.dealId,
    phase: deal.phase,
    mandates: {
      sponsorHash: context.sponsorMandate ? hashEvidence(context.sponsorMandate) : undefined,
      communityHash: context.communityMandate ? hashEvidence(context.communityMandate) : undefined,
    },
    chain: context.chain,
    reputationSources: context.reputationSources,
    signedMessages,
    policyTrail: deal.policyTrail,
    decisionReceipts: deal.decisionReceipts ?? [],
    events: deal.events,
    txHashes: deal.txHashes,
    deliveryProof: deal.deliveryProof,
    escrowId: deal.escrowId,
  };

  return {
    ...unsignedBundle,
    finalHash: hashEvidence(unsignedBundle),
  };
}

export async function writeProofBundle(
  deal: DealRecord,
  context: ProofBundleContext = {},
  baseDir = cachePath('proofs'),
): Promise<{ bundle: ProofBundle; filePath: string }> {
  const bundle = buildProofBundle(deal, context);
  const dir = path.resolve(baseDir);
  await fs.mkdir(dir, { recursive: true });

  const safeDealId = deal.dealId.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const filePath = path.join(dir, `${safeDealId}.proof.json`);
  await fs.writeFile(filePath, JSON.stringify(bundle, null, 2), 'utf-8');

  return { bundle, filePath };
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
