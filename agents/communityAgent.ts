import { privateKeyToAccount } from 'viem/accounts';
import { ERC8004Service } from '../services/erc8004Service';
import { createReputationService } from '../services/reputationService';
import { DeliveryService } from '../services/deliveryService';
import { PersistenceService } from '../services/persistenceService';
import { CommunityPolicy } from '../services/policyService';
import { DealStateService, buildDealId } from '../services/dealStateService';
import { quoteCommunityPost } from '../services/pricingService';
import { AgentMemoryService } from '../services/agentMemoryService';
import { signMessage, verifySignature } from '../utils/signing';
import { withRetry } from '../utils/retryUtils';
import axios from 'axios';
import type {
  HandshakeRequest, HandshakeResponse,
  NegotiationOffer, NegotiationResponse,
  DeliveryNotification
} from '../types/messages';

export interface CommunityMandate {
  platform: 'discord' | 'telegram';
  guildId: string;
  channelId: string;
  memberCount: number;
  priceFloorUsdc: number;
  minSponsorScore: number;
  contentRules: string[];
  maxAdsPerDay: number;
}

export class CommunityAgent {
  private erc8004: ERC8004Service;
  private reputation = createReputationService();
  private delivery: DeliveryService;
  private persistence = new PersistenceService();
  private dealState = new DealStateService('community_deals');
  private memory = new AgentMemoryService();
  private policy: CommunityPolicy;
  private account;
  private agentId: bigint | null = null;
  private mandate: CommunityMandate;
  private adsPostedToday = 0;
  private lastAdResetTimestamp = 0;
  private privateKey: `0x${string}`;
  public lastRawResponse: any;

  constructor(privateKey: `0x${string}`, mandate: CommunityMandate) {
    this.privateKey = privateKey;
    this.erc8004 = new ERC8004Service(privateKey);
    this.delivery = new DeliveryService();
    this.account = privateKeyToAccount(privateKey);
    this.mandate = mandate;
    this.policy = new CommunityPolicy(mandate);
  }

  async initialize(agentCardUri: string, existingAgentId?: bigint): Promise<void> {
    this.agentId = existingAgentId ?? await this.erc8004.registerAgent(agentCardUri);
    await this.dealState.load();
    await this.persistMandate();
    
    // Load persisted state
    const saved = await this.persistence.loadState<any>('community_state');
    if (saved) {
      this.adsPostedToday = saved.adsPostedToday ?? 0;
      this.lastAdResetTimestamp = saved.lastAdResetTimestamp ?? Date.now();
      this.checkAndResetAdLimit();
    } else {
      this.lastAdResetTimestamp = Date.now();
    }

    console.log(`[CommunityAgent] Initialized. ERC-8004 Agent ID: ${this.agentId}`);
  }

  async persistMandate(): Promise<void> {
    await this.memory.saveMandate({
      role: 'community',
      wallet: this.account.address,
      agentId: this.agentId?.toString(),
      mandate: this.mandate,
    });
    await this.persistMemorySnapshot();
  }

  private async persistMemorySnapshot(): Promise<void> {
    await this.memory.writeSnapshot('community', this.account.address, this.dealState.list());
  }

  private checkAndResetAdLimit() {
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    if (now - this.lastAdResetTimestamp > twentyFourHours) {
      console.log(`[CommunityAgent] 24h passed. Resetting ad limit.`);
      this.adsPostedToday = 0;
      this.lastAdResetTimestamp = now;
      this.persistState();
    }
  }

  private async persistState() {
    await this.persistence.saveState('community_state', {
      adsPostedToday: this.adsPostedToday,
      lastAdResetTimestamp: this.lastAdResetTimestamp
    });
  }

  async resetInventoryWindow(): Promise<void> {
    this.adsPostedToday = 0;
    this.lastAdResetTimestamp = Date.now();
    await this.persistState();
  }

  async handleHandshakeRequest(request: HandshakeRequest): Promise<HandshakeResponse> {
    console.log(`[CommunityAgent] Handshake from ${request.senderWallet}`);
    const dealId = buildDealId(request.intentId, request.senderWallet);

    this.checkAndResetAdLimit();

    const sigValid = await verifySignature(
      request,
      request.signature,
      request.senderWallet,
      { requireTimestamp: true }
    );

    const agentWallet = await this.erc8004.getAgentWallet(BigInt(request.senderAgentId));

    const scoreResult = await this.reputation.getScore(
      request.senderWallet,
      BigInt(request.senderAgentId)
    );
    console.log(`[CommunityAgent] Sponsor score: ${scoreResult.score}`);

    const policy = this.policy.evaluateHandshake({
      signatureValid: sigValid,
      registryWallet: agentWallet,
      senderWallet: request.senderWallet,
      senderScore: scoreResult.score,
      timestamp: request.timestamp,
      adsPostedToday: this.adsPostedToday,
    });

    if (!policy.allowed) {
      await this.dealState.transition(dealId, 'REJECTED', {
        actor: 'community',
        type: 'HANDSHAKE_REJECTED',
        summary: policy.reasons.join('; '),
        payload: { request },
      }, {
        sponsorWallet: request.senderWallet,
        sponsorAgentId: request.senderAgentId,
        communityWallet: this.account.address,
        communityAgentId: String(this.agentId),
        policy,
      });
      await this.persistMemorySnapshot();
      return this.rejectHandshake(policy.reasons.join('; '));
    }

    const myScore = await this.reputation.getScore(this.account.address, this.agentId ?? undefined);
    const payload = {
      type: 'HANDSHAKE_RESPONSE' as const,
      accepted: true,
      recipientAgentId: String(this.agentId),
      recipientWallet: this.account.address,
      recipientReputationScore: myScore.score,
      memberCount: this.mandate.memberCount,
      timestamp: Date.now(),
    };

    await this.dealState.transition(dealId, 'HANDSHAKE_VERIFIED', {
      actor: 'community',
      type: 'HANDSHAKE_ACCEPTED',
      summary: `Accepted sponsor ${request.senderWallet} with score ${scoreResult.score}.`,
      payload: { request },
    }, {
      sponsorWallet: request.senderWallet,
      sponsorAgentId: request.senderAgentId,
      communityWallet: this.account.address,
      communityAgentId: String(this.agentId),
      policy,
    });
    await this.persistMemorySnapshot();

    return {
      ...payload,
      signature: await signMessage(payload, this.privateKey),
    };
  }

  async evaluateOffer(
    offer: NegotiationOffer,
    adCopyUri: string,
    sponsorWallet = 'unknown',
    intentId: string | bigint = 'manual',
    sponsorScore = 78
  ): Promise<NegotiationResponse> {
    const adCopy = await this.fetchAdCopy(adCopyUri);
    const dealId = buildDealId(intentId, sponsorWallet);
    const incomingPolicy = this.policy.evaluateIncomingOffer(offer, adCopy);
    const sponsorMemory = await this.memory.counterpartyMemoryWithMem9(this.dealState.list(), sponsorWallet);

    if (!incomingPolicy.allowed) {
      const rejected: any = {
        type: 'REJECT',
        round: offer.round,
        reason: incomingPolicy.reasons.join('; '),
        timestamp: Date.now(),
      };
      rejected.signature = await signMessage(rejected, this.privateKey);
      await this.dealState.transition(dealId, 'REJECTED', {
        actor: 'community',
        type: 'OFFER_REJECTED_BY_POLICY',
        summary: rejected.reason,
        payload: { offer },
      }, {
        sponsorWallet,
        communityWallet: this.account.address,
        communityAgentId: String(this.agentId),
        lastOffer: offer,
        lastResponse: rejected,
        policy: incomingPolicy,
      });
      await this.persistMemorySnapshot();
      return rejected;
    }

    const quote = quoteCommunityPost({
      mandate: this.mandate,
      sponsorScore,
      postType: offer.postType,
      adsPostedToday: this.adsPostedToday,
    });

    const systemPrompt = `You are a community manager agent protecting your Discord community.
Your mandate is strict — you cannot accept below your floor:
- Price floor: $${this.mandate.priceFloorUsdc} USDC
- Active quote for this slot: $${quote.priceUsdc} USDC
- Content rules: ${this.mandate.contentRules.join(', ')}
- Your community size: ${this.mandate.memberCount} members
Sponsor memory: ${sponsorMemory.priorDeals} prior deals, ${sponsorMemory.successfulDeals} settled, ${sponsorMemory.disputedDeals} disputed. ${sponsorMemory.recommendation}
Mem9 recall: ${sponsorMemory.mem9?.summary ?? 'Not queried.'}

Evaluate this incoming ad offer and the ad copy below.
First check if the ad copy violates any content rules. If it does, REJECT immediately.
If the price is at or above your active quote, ACCEPT.
If the price is below your active quote but close (within 20%), COUNTER at the active quote.
If the price is far below or round 3, make a final decision.

This is round ${offer.round} of maximum 3.

IMPORTANT: Respond ONLY with a valid JSON block inside <JSON> tags.
Example:
<JSON>
{
  "decision": "ACCEPT",
  "counterPriceUsdc": null,
  "counterDurationHours": null,
  "counterPostType": null,
  "reason": "The offer meets our floor price and content is safe."
}
</JSON>`;

    const userMessage = `Offer: $${offer.offeredPriceUsdc} USDC for ${offer.postDurationHours}h ${offer.postType} post.
Ad copy to evaluate: "${adCopy}"`;

    const parsed = await this.generateEvaluationJson(systemPrompt, userMessage, offer, quote.priceUsdc);
    const enforced = this.policy.enforceEvaluation(offer, parsed, quote.priceUsdc);

    const responsePayload: any = {
      type: enforced.decision.decision,
      round: offer.round,
      offeredPriceUsdc: enforced.decision.counterPriceUsdc,
      postDurationHours: enforced.decision.counterDurationHours,
      postType: enforced.decision.counterPostType,
      reason: enforced.decision.reason,
      timestamp: Date.now(),
    };

    responsePayload.signature = await signMessage(responsePayload, this.privateKey);

    await this.dealState.transition(dealId, responsePayload.type === 'ACCEPT' ? 'AGREED' : 'NEGOTIATING', {
      actor: 'community',
      type: `OFFER_${responsePayload.type}`,
      summary: `Round ${offer.round} decision: ${responsePayload.type}. ${quote.explanation}`,
      payload: { offer, response: responsePayload, quote },
    }, {
      sponsorWallet,
      communityWallet: this.account.address,
      communityAgentId: String(this.agentId),
      lastOffer: offer,
      lastResponse: responsePayload,
      policy: enforced.policy,
      terms: responsePayload.type === 'ACCEPT' ? {
        priceUsdc: offer.offeredPriceUsdc,
        postDurationHours: offer.postDurationHours,
        postType: offer.postType,
      } : undefined,
    });
    await this.persistMemorySnapshot();

    console.log(`[CommunityAgent] Round ${offer.round} decision: ${responsePayload.type}`);
    return responsePayload;
  }

  async postAd(adCopy: string, escrowId: string, escrowContract?: any): Promise<DeliveryNotification> {
    console.log(`[CommunityAgent] Posting ad for escrow ${escrowId}...`);

    let deliveryProof: string;
    if (this.mandate.platform === 'discord') {
      const messageId = await withRetry(() => this.delivery.postToDiscord(this.mandate.channelId, adCopy));
      deliveryProof = `discord:${this.mandate.guildId}:${messageId}`;
    } else {
      const messageId = await withRetry(() => this.delivery.postToTelegram(this.mandate.guildId, adCopy));
      deliveryProof = `telegram:${this.mandate.guildId}:${messageId}`;
    }

    let txHash = '';
    if (escrowContract) {
      txHash = await withRetry(() => escrowContract.write.logDelivery([BigInt(escrowId), deliveryProof]));
    }

    this.adsPostedToday++;
    await this.persistState();

    const notification: any = {
      type: 'DELIVERY_COMPLETE',
      escrowId,
      deliveryProof,
      txHash, 
      timestamp: Date.now(),
    };

    notification.signature = await signMessage(notification, this.privateKey);
    await this.dealState.transition(buildDealId(escrowId, this.account.address), 'DELIVERED', {
      actor: 'community',
      type: 'AD_DELIVERED',
      summary: `Delivered ad proof ${deliveryProof}.`,
      payload: notification,
    }, {
      communityWallet: this.account.address,
      communityAgentId: String(this.agentId),
      escrowId,
      deliveryProof,
      txHash,
    });
    await this.persistMemorySnapshot();
    return notification;
  }

  getRuntimeStatus() {
    return {
      agentId: this.agentId?.toString() ?? null,
      address: this.account.address,
      adsPostedToday: this.adsPostedToday,
      lastAdResetTimestamp: this.lastAdResetTimestamp,
      deals: this.dealState.list(),
      memory: {
        totalDeals: this.dealState.list().length,
        recentReceipts: this.dealState.list().flatMap((deal) => deal.decisionReceipts ?? []).slice(0, 5),
      },
    };
  }

  async shutdown(): Promise<void> {
    await this.delivery.close();
  }

  private async fetchAdCopy(uri: string): Promise<string> {
    if (uri === 'ipfs://mock-ad-copy') {
        return "🚀 Join the AdMarket Revolution! Decentralized sponsorship for micro-communities.";
    }
    // For demo, return static text if not IPFS
    if (uri.startsWith('ipfs://')) {
        try {
            const res = await withRetry(() => axios.get(`https://ipfs.io/ipfs/${uri.replace('ipfs://', '')}`, { timeout: 5000 }));
            return res.data;
        } catch (err) {
            console.warn(`[CommunityAgent] Failed to fetch from IPFS: ${uri}. Using fallback.`);
            return "🚀 Join the AdMarket Revolution! Decentralized sponsorship for micro-communities.";
        }
    }
    return uri;
  }

  private rejectHandshake(reason: string, detail?: string): HandshakeResponse {
    return {
      type: 'HANDSHAKE_RESPONSE',
      accepted: false,
      reason: detail ?? reason,
      recipientAgentId: String(this.agentId),
      recipientWallet: this.account.address,
      recipientReputationScore: 0,
      timestamp: Date.now(),
      signature: '',
    };
  }

  private async generateEvaluationJson(
    systemPrompt: string,
    userMessage: string,
    offer: NegotiationOffer,
    minimumAcceptablePrice = this.mandate.priceFloorUsdc
  ): Promise<any> {
    if (!process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY.includes('...')) {
      return this.deterministicEvaluation(offer, minimumAcceptablePrice);
    }

    try {
      const result = await withRetry(async () => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${process.env.GOOGLE_API_KEY}`;
        return await axios.post(url, {
          contents: [
            { role: 'user', parts: [{ text: systemPrompt + "\n\n" + userMessage }] }
          ]
        }, { timeout: 10000 });
      }, { onRetry: (err, i) => console.warn(`[CommunityAgent] Gemini API retry ${i}...`) });

      const response = result.data.candidates[0].content;
      this.lastRawResponse = result.data;
      const text = response.parts[0].text;
      const jsonMatch = text.match(/<JSON>([\s\S]*?)<\/JSON>/) || text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Agent failed to produce valid JSON evaluation");
      return JSON.parse(jsonMatch[1] || jsonMatch[0]);
    } catch (err: any) {
      this.lastRawResponse = { fallback: 'deterministic_evaluation', reason: err.message };
      console.warn(`[CommunityAgent] LLM evaluation failed. Using deterministic policy fallback.`);
      return this.deterministicEvaluation(offer, minimumAcceptablePrice);
    }
  }

  private deterministicEvaluation(offer: NegotiationOffer, minimumAcceptablePrice = this.mandate.priceFloorUsdc) {
    if (offer.offeredPriceUsdc >= minimumAcceptablePrice) {
      return {
        decision: 'ACCEPT',
        counterPriceUsdc: null,
        counterDurationHours: null,
        counterPostType: null,
        reason: 'Offer satisfies deterministic community mandate.',
      };
    }

    const closeEnough = offer.offeredPriceUsdc >= minimumAcceptablePrice * 0.8;
    if (closeEnough && offer.round < 3) {
      return {
        decision: 'COUNTER',
        counterPriceUsdc: minimumAcceptablePrice,
        counterDurationHours: offer.postDurationHours,
        counterPostType: offer.postType,
        reason: 'Offer is below floor but close enough to counter.',
      };
    }

    return {
      decision: 'REJECT',
      counterPriceUsdc: null,
      counterDurationHours: null,
      counterPostType: null,
      reason: 'Offer is below floor and not worth further negotiation.',
    };
  }
}
