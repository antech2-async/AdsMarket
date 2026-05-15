import { SponsorAgent } from '../agents/sponsorAgent';
import { ERC8004Service } from './erc8004Service';

export class SettlementService {
  private pendingSettlements = new Map<string, {
    escrowId: string;
    deliveryProof: string;
    settleAfter: number;
    communityWallet: string;
    sponsorAgent: SponsorAgent;
    escrowContract: any;
    erc8004: ERC8004Service;
    sponsorAgentId: bigint;
    communityAgentId: bigint;
  }>();

  register(params: {
    escrowId: string;
    deliveryProof: string;
    settleAfterMs: number;
    communityWallet: string;
    sponsorAgent: SponsorAgent;
    escrowContract: any;
    erc8004: ERC8004Service;
    sponsorAgentId: bigint;
    communityAgentId: bigint;
  }): void {
    this.pendingSettlements.set(params.escrowId, {
      ...params,
      settleAfter: Date.now() + params.settleAfterMs,
    });
    console.log(`[Settlement] Escrow ${params.escrowId} registered. Settles at ${new Date(Date.now() + params.settleAfterMs).toISOString()}`);
  }

  async processSettlements(): Promise<Array<{
    escrowId: string;
    status: 'pending' | 'settled' | 'disputed' | 'failed';
    error?: string;
  }>> {
    const now = Date.now();
    const results: Array<{
      escrowId: string;
      status: 'pending' | 'settled' | 'disputed' | 'failed';
      error?: string;
    }> = [];

    for (const [escrowId, settlement] of this.pendingSettlements.entries()) {
      if (now < settlement.settleAfter) {
        results.push({ escrowId, status: 'pending' });
        continue;
      }

      try {
        const verified = await settlement.sponsorAgent.verifyDelivery(settlement.deliveryProof);

        if (verified) {
          await settlement.escrowContract.write.settle([BigInt(escrowId)]);
          console.log(`[Settlement] Escrow ${escrowId} settled.`);

          await settlement.erc8004.postFeedback(
            settlement.communityAgentId,
            90,
            'sponsorship.delivery',
            'ipfs://QmPositiveFeedback'
          );
          await settlement.erc8004.postFeedback(
            settlement.sponsorAgentId,
            90,
            'sponsorship.payment',
            'ipfs://QmPositiveFeedback'
          );

          console.log(`[Settlement] ERC-8004 reputation updated for both agents.`);
          results.push({ escrowId, status: 'settled' });
        } else {
          await settlement.escrowContract.write.dispute([BigInt(escrowId)]);
          console.log(`[Settlement] Escrow ${escrowId} DISPUTED. Admin review required.`);

          await settlement.erc8004.postFeedback(
            settlement.communityAgentId,
            10,
            'sponsorship.delivery.failed',
            'ipfs://QmNegativeFeedback'
          );
          results.push({ escrowId, status: 'disputed' });
        }

        this.pendingSettlements.delete(escrowId);
      } catch (err) {
        console.error(`[Settlement] Error processing escrow ${escrowId}:`, err);
        results.push({
          escrowId,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return results;
  }

  startProcessingLoop(intervalMs = 30_000): void {
    setInterval(() => this.processSettlements(), intervalMs);
    console.log(`[Settlement] Processing loop started. Interval: ${intervalMs}ms`);
  }
}
