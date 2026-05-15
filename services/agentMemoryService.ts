import { PersistenceService } from './persistenceService';
import { Mem9MemoryService } from './mem9MemoryService';
import type { DealPhase, DealRecord } from '../types/deal';

export type AgentRole = 'sponsor' | 'community';

export interface AgentMandateSnapshot {
  role: AgentRole;
  wallet: string;
  agentId?: string;
  mandate: unknown;
  updatedAt: number;
}

export interface CounterpartyMemory {
  counterpartyWallet: string;
  priorDeals: number;
  successfulDeals: number;
  disputedDeals: number;
  rejectedDeals: number;
  lastPhase?: DealPhase;
  lastSeenAt?: number;
  recommendation: string;
  mem9?: {
    enabled: boolean;
    recalled: number;
    summary: string;
    error?: string;
  };
}

export interface AgentMemorySnapshot {
  role: AgentRole;
  wallet: string;
  updatedAt: number;
  totalDeals: number;
  settledDeals: number;
  disputedDeals: number;
  rejectedDeals: number;
  recentReceipts: DealRecord['decisionReceipts'];
}

export class AgentMemoryService {
  private persistence = new PersistenceService();
  private mem9 = new Mem9MemoryService();

  async saveMandate(snapshot: Omit<AgentMandateSnapshot, 'updatedAt'>): Promise<AgentMandateSnapshot> {
    const record = { ...snapshot, updatedAt: Date.now() };
    await this.persistence.saveState(`${snapshot.role}_mandate`, record);
    return record;
  }

  async loadMandate(role: AgentRole): Promise<AgentMandateSnapshot | null> {
    return this.persistence.loadState<AgentMandateSnapshot>(`${role}_mandate`);
  }

  counterpartyMemory(deals: DealRecord[], wallet: string): CounterpartyMemory {
    const normalized = wallet.toLowerCase();
    const relevant = deals.filter((deal) =>
      deal.sponsorWallet?.toLowerCase() === normalized || deal.communityWallet?.toLowerCase() === normalized,
    );
    const successfulDeals = relevant.filter((deal) => deal.phase === 'SETTLED').length;
    const disputedDeals = relevant.filter((deal) => deal.phase === 'DISPUTED').length;
    const rejectedDeals = relevant.filter((deal) => deal.phase === 'REJECTED' || deal.phase === 'FAILED').length;
    const last = relevant.sort((a, b) => b.updatedAt - a.updatedAt)[0];

    return {
      counterpartyWallet: wallet,
      priorDeals: relevant.length,
      successfulDeals,
      disputedDeals,
      rejectedDeals,
      lastPhase: last?.phase,
      lastSeenAt: last?.updatedAt,
      recommendation: recommendation(successfulDeals, disputedDeals, rejectedDeals),
    };
  }

  async counterpartyMemoryWithMem9(deals: DealRecord[], wallet: string): Promise<CounterpartyMemory> {
    const local = this.counterpartyMemory(deals, wallet);
    const result = await this.mem9.search({
      q: `AdSourcing counterparty ${wallet} prior sponsorship deals settlement disputes reputation`,
      tags: ['adsourcing', 'deal'],
      limit: 3,
    });

    if (!result.ok) {
      return {
        ...local,
        mem9: {
          enabled: false,
          recalled: 0,
          summary: 'Mem9 recall unavailable; using local deal memory and on-chain receipts.',
          error: result.error,
        },
      };
    }

    const relevant = result.memories.filter((memory) => {
      const haystack = `${memory.content ?? ''} ${JSON.stringify(memory.metadata ?? {})}`.toLowerCase();
      return haystack.includes(wallet.toLowerCase());
    });

    return {
      ...local,
      mem9: {
        enabled: true,
        recalled: relevant.length,
        summary: relevant.length
          ? relevant.map((memory) => String(memory.content ?? '').slice(0, 220)).join(' | ')
          : 'No Mem9 prior counterparty memory found.',
      },
    };
  }

  async writeSnapshot(role: AgentRole, wallet: string, deals: DealRecord[]): Promise<AgentMemorySnapshot> {
    const snapshot: AgentMemorySnapshot = {
      role,
      wallet,
      updatedAt: Date.now(),
      totalDeals: deals.length,
      settledDeals: deals.filter((deal) => deal.phase === 'SETTLED').length,
      disputedDeals: deals.filter((deal) => deal.phase === 'DISPUTED').length,
      rejectedDeals: deals.filter((deal) => deal.phase === 'REJECTED' || deal.phase === 'FAILED').length,
      recentReceipts: deals
        .flatMap((deal) => deal.decisionReceipts ?? [])
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 8),
    };
    await this.persistence.saveState(`${role}_memory`, snapshot);
    await this.syncSettledDealsToMem9(role, wallet, deals);
    return snapshot;
  }

  async rememberSettlement(params: {
    role: AgentRole;
    wallet: string;
    deal: DealRecord;
    proofHash?: string;
    receiptId?: string;
    paymentReceiptPath?: string;
    source?: string;
  }): Promise<void> {
    await this.storeDealInMem9(params.role, params.wallet, params.deal, {
      proofHash: params.proofHash,
      receiptId: params.receiptId,
      paymentReceiptPath: params.paymentReceiptPath,
      source: params.source,
    });
  }

  async mem9Status() {
    return this.mem9.status();
  }

  private async syncSettledDealsToMem9(role: AgentRole, wallet: string, deals: DealRecord[]): Promise<void> {
    const settled = deals.filter((deal) => deal.phase === 'SETTLED');
    for (const deal of settled) {
      await this.storeDealInMem9(role, wallet, deal, { source: 'agent-memory-snapshot' });
    }
  }

  private async storeDealInMem9(
    role: AgentRole,
    wallet: string,
    deal: DealRecord,
    extra: {
      proofHash?: string;
      receiptId?: string;
      paymentReceiptPath?: string;
      source?: string;
    } = {},
  ): Promise<void> {
    const phase = extra.receiptId || extra.proofHash ? 'SETTLED' : deal.phase;
    const dedupeKey = `mem9_deal_${role}_${deal.dealId}_${phase}_${extra.receiptId ?? deal.deliveryProof ?? deal.escrowId ?? 'snapshot'}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const existing = await this.persistence.loadState<{ storedAt: number; mem9Id?: string }>(dedupeKey);
    if (existing) return;

    const content = [
      `AdSourcing ${role} agent completed sponsorship deal ${deal.dealId}.`,
      `Outcome: ${phase}.`,
      deal.sponsorWallet ? `Sponsor wallet: ${deal.sponsorWallet}.` : undefined,
      deal.communityWallet ? `Community wallet: ${deal.communityWallet}.` : undefined,
      deal.terms ? `Terms: ${deal.terms.priceUsdc} USDC, ${deal.terms.postDurationHours}h, ${deal.terms.postType} post.` : undefined,
      deal.escrowId ? `Escrow: ${deal.escrowId}.` : undefined,
      deal.deliveryProof ? `Delivery proof: ${deal.deliveryProof}.` : undefined,
      extra.proofHash ? `Proof hash: ${extra.proofHash}.` : undefined,
      extra.receiptId ? `Payment receipt: ${extra.receiptId}.` : undefined,
      deal.txHashes.length ? `Tx hashes: ${deal.txHashes.join(', ')}.` : undefined,
      'Use this memory to price future deals, identify repeat counterparties, and treat disputed or failed prior outcomes as risk signals.',
    ].filter(Boolean).join(' ');

    const result = await this.mem9.store({
      content,
      source: `adsourcing-${role}`,
      tags: ['adsourcing', 'deal', role, phase.toLowerCase()],
      metadata: {
        role,
        wallet,
        dealId: deal.dealId,
        phase,
        sponsorWallet: deal.sponsorWallet,
        communityWallet: deal.communityWallet,
        escrowId: deal.escrowId,
        deliveryProof: deal.deliveryProof,
        terms: deal.terms,
        proofHash: extra.proofHash,
        receiptId: extra.receiptId,
        paymentReceiptPath: extra.paymentReceiptPath,
        txHashes: deal.txHashes,
        source: extra.source ?? 'adsourcing-runtime',
      },
    });

    if (result.ok) {
      await this.persistence.saveState(dedupeKey, { storedAt: Date.now(), mem9Id: result.id });
    }
  }
}

function recommendation(successful: number, disputed: number, rejected: number): string {
  if (disputed > 0) return 'Treat as high-risk until new proof is supplied.';
  if (successful >= 2) return 'Known good counterparty; standard terms are acceptable.';
  if (rejected > 0) return 'Proceed only if current mandate checks pass cleanly.';
  return 'No prior relationship; rely on signature, reputation, policy, and escrow.';
}
