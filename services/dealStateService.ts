import { PersistenceService } from './persistenceService';
import { buildDecisionReceipt } from './receiptService';
import type { DealEvent, DealPhase, DealRecord, DealTerms, PolicyDecision } from '../types/deal';
import type { NegotiationOffer, NegotiationResponse } from '../types/messages';

export interface DealPatch {
  sponsorWallet?: string;
  communityWallet?: string;
  sponsorAgentId?: string;
  communityAgentId?: string;
  terms?: DealTerms;
  lastOffer?: NegotiationOffer;
  lastResponse?: NegotiationResponse;
  deliveryProof?: string;
  escrowId?: string;
  txHash?: string;
  policy?: PolicyDecision;
}

export class DealStateService {
  private persistence: PersistenceService;
  private deals = new Map<string, DealRecord>();

  constructor(private readonly fileName: string, baseDir = 'cache') {
    this.persistence = new PersistenceService(baseDir);
  }

  async load(): Promise<void> {
    const saved = await this.persistence.loadState<Record<string, DealRecord>>(this.fileName);
    if (saved) this.deals = new Map(Object.entries(saved));
  }

  async save(): Promise<void> {
    await this.persistence.saveState(this.fileName, Object.fromEntries(this.deals));
  }

  get(dealId: string): DealRecord | undefined {
    return this.deals.get(dealId);
  }

  list(): DealRecord[] {
    return [...this.deals.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async transition(
    dealId: string,
    phase: DealPhase,
    event: Omit<DealEvent, 'timestamp'>,
    patch: DealPatch = {},
  ): Promise<DealRecord> {
    const now = Date.now();
    const existing = this.deals.get(dealId);
    const record: DealRecord = existing ?? {
      dealId,
      intentId: dealId.split(':')[0],
      phase: 'DISCOVERED',
      txHashes: [],
      policyTrail: [],
      decisionReceipts: [],
      events: [],
      createdAt: now,
      updatedAt: now,
    };

    record.txHashes ??= [];
    record.policyTrail ??= [];
    record.decisionReceipts ??= [];
    record.events ??= [];

    const receipt = event.receipt ?? buildDecisionReceipt({
      actor: event.actor,
      action: event.type,
      summary: event.summary,
      policy: patch.policy,
      proof: [
        patch.txHash ? `tx:${patch.txHash}` : undefined,
        patch.deliveryProof ? `delivery:${patch.deliveryProof}` : undefined,
        patch.escrowId ? `escrow:${patch.escrowId}` : undefined,
      ],
      createdAt: now,
    });

    record.phase = phase;
    record.updatedAt = now;
    record.events.push({ ...event, timestamp: now, receipt });
    record.decisionReceipts.push(receipt);

    if (patch.sponsorWallet) record.sponsorWallet = patch.sponsorWallet;
    if (patch.communityWallet) record.communityWallet = patch.communityWallet;
    if (patch.sponsorAgentId) record.sponsorAgentId = patch.sponsorAgentId;
    if (patch.communityAgentId) record.communityAgentId = patch.communityAgentId;
    if (patch.terms) record.terms = patch.terms;
    if (patch.lastOffer) record.lastOffer = patch.lastOffer;
    if (patch.lastResponse) record.lastResponse = patch.lastResponse;
    if (patch.deliveryProof) record.deliveryProof = patch.deliveryProof;
    if (patch.escrowId) record.escrowId = patch.escrowId;
    if (patch.txHash) record.txHashes.push(patch.txHash);
    if (patch.policy) record.policyTrail.push(patch.policy);

    this.deals.set(dealId, record);
    await this.save();
    return record;
  }
}

export function buildDealId(intentId: string | bigint | number, wallet: string): string {
  return `${String(intentId)}:${wallet.toLowerCase()}`;
}
