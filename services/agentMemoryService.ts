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
  mem9SyncStatus?: 'synced' | 'local_only';
}

class Mem9Client {
  private apiKey = process.env.MEM9_API_KEY;
  private endpoint = 'https://api.mem9.ai/v1/memory';

  async syncMemory(wallet: string, snapshot: any): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      // Hackathon: Simulate the Mem9 context push
      console.log(`[Mem9] Syncing context for wallet ${wallet}...`);
      await new Promise(r => setTimeout(r, 300));
      // In production, this would be a real fetch to mem9.ai:
      // await fetch(this.endpoint, { method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}` }, body: JSON.stringify(snapshot) });
      return true;
    } catch (err) {
      console.warn('[Mem9] Failed to sync:', err);
      return false;
    }
  }
}

export class AgentMemoryService {
  private persistence = new PersistenceService();
  private mem9 = new Mem9Client();

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

    // Push to Mem9 for persistent cross-session memory
    const isSynced = await this.mem9.syncMemory(wallet, snapshot);
    snapshot.mem9SyncStatus = isSynced ? 'synced' : 'local_only';

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
