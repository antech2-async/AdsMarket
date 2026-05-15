import { createHash } from 'crypto';
import type { DealTerms } from '../types/deal';

export interface AgreementEvidence {
  agreementHash: `0x${string}`;
  contentHash: `0x${string}`;
  agreementPayload: {
    sponsorWallet: string;
    communityWallet: string;
    sponsorAgentId: string;
    communityAgentId: string;
    intentId: string;
    terms: DealTerms;
    adCopyHash: `0x${string}`;
    acceptedAt: number;
  };
}

export interface AgreementEvidenceInput {
  sponsorWallet: string;
  communityWallet: string;
  sponsorAgentId: string | bigint;
  communityAgentId: string | bigint;
  intentId: string | bigint;
  terms: DealTerms;
  adCopy: string;
  acceptedAt?: number;
}

export function buildAgreementEvidence(input: AgreementEvidenceInput): AgreementEvidence {
  const contentHash = bytes32Hash(input.adCopy);
  const agreementPayload = {
    sponsorWallet: input.sponsorWallet,
    communityWallet: input.communityWallet,
    sponsorAgentId: String(input.sponsorAgentId),
    communityAgentId: String(input.communityAgentId),
    intentId: String(input.intentId),
    terms: input.terms,
    adCopyHash: contentHash,
    acceptedAt: input.acceptedAt ?? Date.now(),
  };

  return {
    agreementHash: bytes32Hash(agreementPayload),
    contentHash,
    agreementPayload,
  };
}

export function bytes32Hash(value: unknown): `0x${string}` {
  return `0x${createHash('sha256').update(stableStringify(value)).digest('hex')}`;
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
