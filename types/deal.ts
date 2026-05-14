import type { NegotiationOffer, NegotiationResponse } from './messages';

export type DealPhase =
  | 'DISCOVERED'
  | 'HANDSHAKE_VERIFIED'
  | 'NEGOTIATING'
  | 'AGREED'
  | 'ESCROW_FUNDED'
  | 'DELIVERED'
  | 'SETTLED'
  | 'DISPUTED'
  | 'REJECTED'
  | 'FAILED';

export type PolicySeverity = 'info' | 'warn' | 'block';

export interface PolicyCheck {
  id: string;
  passed: boolean;
  severity: PolicySeverity;
  detail: string;
  observed?: unknown;
  expected?: unknown;
}

export interface PolicyDecision {
  allowed: boolean;
  checks: PolicyCheck[];
  reasons: string[];
}

export type ReceiptRisk = 'low' | 'medium' | 'high';

export interface DecisionReceipt {
  id: string;
  actor: 'sponsor' | 'community' | 'system';
  action: string;
  why: string;
  risk: ReceiptRisk;
  policyChecks: Array<{
    id: string;
    passed: boolean;
    detail: string;
  }>;
  proof: string[];
  nextStep?: string;
  createdAt: number;
}

export interface DealTerms {
  priceUsdc: number;
  postDurationHours: number;
  postType: 'pinned' | 'standard';
}

export interface DealEvent {
  type: string;
  timestamp: number;
  actor: 'sponsor' | 'community' | 'system';
  summary: string;
  payload?: unknown;
  receipt?: DecisionReceipt;
}

export interface DealRecord {
  dealId: string;
  intentId: string;
  phase: DealPhase;
  sponsorWallet?: string;
  communityWallet?: string;
  sponsorAgentId?: string;
  communityAgentId?: string;
  terms?: DealTerms;
  lastOffer?: NegotiationOffer;
  lastResponse?: NegotiationResponse;
  deliveryProof?: string;
  escrowId?: string;
  txHashes: string[];
  policyTrail: PolicyDecision[];
  decisionReceipts: DecisionReceipt[];
  events: DealEvent[];
  createdAt: number;
  updatedAt: number;
}
