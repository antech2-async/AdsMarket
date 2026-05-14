import type { SponsorAgent } from '../agents/sponsorAgent';
import type { CommunityAgent } from '../agents/communityAgent';
import type { NegotiationResponse } from '../types/messages';

export interface ActiveSponsorIntent {
  intentId: string;
  sponsorWallet: string;
  sponsorAgentId: string;
  maxBudgetUsdc: number;
  minMemberCount: number;
  contentPolicy: string;
  adCopy: string;
  sponsorScore?: number;
}

export interface IntentSource {
  getActiveIntents(): Promise<ActiveSponsorIntent[]>;
}

export interface WorkerResult {
  intentId: string;
  status: 'accepted' | 'rejected' | 'skipped' | 'failed';
  reason?: string;
}

export class MemoryIntentSource implements IntentSource {
  constructor(private readonly intents: ActiveSponsorIntent[]) {}

  async getActiveIntents(): Promise<ActiveSponsorIntent[]> {
    return this.intents;
  }
}

export class ViemIntentRegistrySource implements IntentSource {
  constructor(private readonly contract: any, private readonly limit = 20n) {}

  async getActiveIntents(): Promise<ActiveSponsorIntent[]> {
    const [intents, ids] = await this.contract.read.getActiveIntents([0n, this.limit]);
    return intents.map((intent: any, index: number) => ({
      intentId: String(ids[index]),
      sponsorWallet: intent.sponsorAgent,
      sponsorAgentId: String(intent.erc8004AgentId),
      maxBudgetUsdc: Number(intent.maxBudgetUsdc) / 1_000_000,
      minMemberCount: Number(intent.minMemberCount),
      contentPolicy: intent.contentPolicy,
      adCopy: intent.adCopy,
    }));
  }
}

export class IntentPollingWorker {
  private seen = new Set<string>();

  constructor(
    private readonly source: IntentSource,
    private readonly sponsorAgent: SponsorAgent,
    private readonly communityAgent: CommunityAgent,
    private readonly communityWallet: string,
  ) {}

  async runOnce(): Promise<WorkerResult[]> {
    const intents = await this.source.getActiveIntents();
    const results: WorkerResult[] = [];

    for (const intent of intents) {
      if (this.seen.has(intent.intentId)) {
        results.push({ intentId: intent.intentId, status: 'skipped', reason: 'already processed' });
        continue;
      }
      this.seen.add(intent.intentId);
      results.push(await this.processIntent(intent));
    }

    return results;
  }

  private async processIntent(intent: ActiveSponsorIntent): Promise<WorkerResult> {
    try {
      const handshake = await this.sponsorAgent.createHandshakeRequest(intent.intentId);
      const handshakeResponse = await this.communityAgent.handleHandshakeRequest(handshake);
      if (!handshakeResponse.accepted) {
        return { intentId: intent.intentId, status: 'rejected', reason: handshakeResponse.reason };
      }

      let round = 1;
      let lastResponse: NegotiationResponse | undefined;

      while (round <= 3) {
        const offer = await this.sponsorAgent.makeOffer(
          this.communityWallet,
          handshakeResponse.recipientReputationScore,
          handshakeResponse.memberCount ?? intent.minMemberCount,
          round,
          lastResponse,
          intent.intentId,
        );
        const evaluation = await this.communityAgent.evaluateOffer(
          offer,
          intent.adCopy,
          intent.sponsorWallet,
          intent.intentId,
          intent.sponsorScore ?? handshake.senderReputationScore,
        );

        if (evaluation.type === 'ACCEPT') {
          return { intentId: intent.intentId, status: 'accepted' };
        }
        if (evaluation.type === 'REJECT') {
          return { intentId: intent.intentId, status: 'rejected', reason: evaluation.reason };
        }

        lastResponse = evaluation;
        round++;
      }

      return { intentId: intent.intentId, status: 'failed', reason: 'negotiation exhausted' };
    } catch (error: any) {
      return { intentId: intent.intentId, status: 'failed', reason: error.message };
    }
  }
}
