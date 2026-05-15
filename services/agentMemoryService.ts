import { PersistenceService } from './persistenceService';
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
    return snapshot;
  }
}

function recommendation(successful: number, disputed: number, rejected: number): string {
  if (disputed > 0) return 'Treat as high-risk until new proof is supplied.';
  if (successful >= 2) return 'Known good counterparty; standard terms are acceptable.';
  if (rejected > 0) return 'Proceed only if current mandate checks pass cleanly.';
  return 'No prior relationship; rely on signature, reputation, policy, and escrow.';
}
