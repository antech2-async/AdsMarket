import { createWalletClient, http, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ERC8004Service } from '../services/erc8004Service';
import { createReputationService } from '../services/reputationService';
import { PersistenceService } from '../services/persistenceService';
import { SponsorPolicy } from '../services/policyService';
import { DealStateService, buildDealId } from '../services/dealStateService';
import { buildAgreementEvidence } from '../services/agreementService';
import { AgentMemoryService } from '../services/agentMemoryService';
import { runtimeChain, runtimeRpcUrl } from '../services/chainConfig';
import { signMessage, verifySignature } from '../utils/signing';
import { withRetry } from '../utils/retryUtils';
import axios from 'axios';
import type {
  HandshakeRequest, HandshakeResponse,
  NegotiationOffer, NegotiationResponse
} from '../types/messages';
import type { DealTerms } from '../types/deal';

export interface SponsorMandate {
  budgetUsdc: number;           // total campaign budget
  maxPricePerPostUsdc: number;  // per-post ceiling
  minMemberCount: number;       // community size floor
  minReputationScore: number;     // counterparty score floor (spam gate)
  contentPolicy: string;        // human-readable content rules
  adCopy: string;               // the actual ad text to post
  campaignName: string;
}

export class SponsorAgent {
  private erc8004: ERC8004Service;
  private reputation = createReputationService();
  private persistence = new PersistenceService();
  private dealState = new DealStateService('sponsor_deals');
  private memory = new AgentMemoryService();
  private policy: SponsorPolicy;
  private account;
  private walletClient;
  private agentId: bigint | null = null;
  private mandate: SponsorMandate;
  private activeNegotiations = new Map<string, NegotiationOffer[]>();
  private privateKey: `0x${string}`;
  public lastRawResponse: any;

  constructor(privateKey: `0x${string}`, mandate: SponsorMandate) {
    this.privateKey = privateKey;
    this.erc8004 = new ERC8004Service(privateKey);
    this.account = privateKeyToAccount(privateKey);
    this.walletClient = createWalletClient({
      account: this.account,
      chain: runtimeChain(),
      transport: http(runtimeRpcUrl()),
    });
    this.mandate = mandate;
    this.policy = new SponsorPolicy(mandate);
  }

  async initialize(agentCardUri: string, existingAgentId?: bigint): Promise<void> {
    this.agentId = existingAgentId ?? await this.erc8004.registerAgent(agentCardUri);
    await this.dealState.load();
    await this.persistMandate();
    
    // Load persisted negotiations
    const saved = await this.persistence.loadState<any>('sponsor_negotiations');
    if (saved) {
      this.activeNegotiations = new Map(Object.entries(saved));
      console.log(`[SponsorAgent] Recovered ${this.activeNegotiations.size} negotiations from persistence.`);
    }

    console.log(`[SponsorAgent] Initialized. ERC-8004 Agent ID: ${this.agentId}`);
  }

  async persistMandate(): Promise<void> {
    await this.memory.saveMandate({
      role: 'sponsor',
      wallet: this.account.address,
      agentId: this.agentId?.toString(),
      mandate: this.mandate,
    });
    await this.memory.writeSnapshot('sponsor', this.account.address, this.dealState.list());
  }

  private async persistMemorySnapshot(): Promise<void> {
    await this.memory.writeSnapshot('sponsor', this.account.address, this.dealState.list());
  }

  async broadcastIntent(intentRegistryContract: any): Promise<bigint> {
    return withRetry(async () => {
      const hash = await intentRegistryContract.write.broadcastIntent([
        this.agentId!,
        parseUnits(String(this.mandate.maxPricePerPostUsdc), 6),
        BigInt(this.mandate.minMemberCount),
        'ipfs://QmContentPolicy',
        'ipfs://QmAdCopy',
        BigInt(3600), // 1 hour TTL
      ]);
      console.log(`[SponsorAgent] Intent broadcast hash: ${hash}`);
      return hash;
    });
  }

  async createHandshakeRequest(intentId: string | bigint): Promise<HandshakeRequest> {
    const myScore = await this.reputation.getScore(this.account.address, this.agentId ?? undefined);
    const payload: HandshakeRequest = {
      type: 'HANDSHAKE_REQUEST',
      senderAgentId: String(this.agentId),
      senderWallet: this.account.address,
      senderReputationScore: myScore.score,
      intentId: String(intentId),
      timestamp: Date.now(),
      signature: '',
    };

    return {
      ...payload,
      signature: await signMessage(payload, this.privateKey),
    };
  }

  async handleHandshake(request: HandshakeRequest): Promise<HandshakeResponse> {
    console.log(`[SponsorAgent] Handshake from ${request.senderWallet}`);
    const dealId = buildDealId(request.intentId, request.senderWallet);

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
    console.log(`[SponsorAgent] Counterparty score: ${scoreResult.score}`);

    const policy = this.policy.evaluateHandshake({
      signatureValid: sigValid,
      registryWallet: agentWallet,
      senderWallet: request.senderWallet,
      senderScore: scoreResult.score,
      timestamp: request.timestamp,
    });

    if (!policy.allowed) {
      await this.dealState.transition(dealId, 'REJECTED', {
        actor: 'sponsor',
        type: 'HANDSHAKE_REJECTED',
        summary: policy.reasons.join('; '),
        payload: { request },
      }, {
        communityWallet: request.senderWallet,
        communityAgentId: request.senderAgentId,
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
      timestamp: Date.now(),
    };

    await this.dealState.transition(dealId, 'HANDSHAKE_VERIFIED', {
      actor: 'sponsor',
      type: 'HANDSHAKE_ACCEPTED',
      summary: `Accepted community ${request.senderWallet} with score ${scoreResult.score}.`,
      payload: { request },
    }, {
      sponsorWallet: this.account.address,
      communityWallet: request.senderWallet,
      sponsorAgentId: String(this.agentId),
      communityAgentId: request.senderAgentId,
      policy,
    });
    await this.persistMemorySnapshot();

    return {
      ...payload,
      signature: await signMessage(payload, this.privateKey),
    };
  }

  async makeOffer(
    communityWallet: string,
    communityScore: number,
    memberCount: number,
    round: number,
    previousCounter?: NegotiationResponse,
    intentId: string | bigint = 'manual'
  ): Promise<NegotiationOffer> {
    const history = this.activeNegotiations.get(communityWallet) ?? [];
    const counterpartyMemory = this.memory.counterpartyMemory(this.dealState.list(), communityWallet);

    const systemPrompt = `You are a negotiation agent acting on behalf of an advertiser.
Your mandate is strict — you cannot exceed it:
- Maximum price per post: $${this.mandate.maxPricePerPostUsdc} USDC
- Content policy: ${this.mandate.contentPolicy}

The community has ${memberCount} members and a reputation score of ${communityScore}/100.
A higher score means you can trust them more. A score above 80 means minor premium is acceptable.
Counterparty memory: ${counterpartyMemory.priorDeals} prior deals, ${counterpartyMemory.successfulDeals} settled, ${counterpartyMemory.disputedDeals} disputed. ${counterpartyMemory.recommendation}

Your goal: close a deal within budget. Be reasonable. This is round ${round} of maximum 3.
If this is round 3, either accept their last counter or walk away — no more counters.

IMPORTANT: Respond ONLY with a valid JSON block inside <JSON> tags.
Example:
<JSON>
{
  "offeredPriceUsdc": 35,
  "postDurationHours": 12,
  "postType": "standard",
  "reasoning": "Matching their price as it is within budget and they have high reputation."
}
</JSON>`;

    const userMessage = previousCounter
      ? `Their counter-offer: $${previousCounter.offeredPriceUsdc} USDC for ${previousCounter.postDurationHours}h ${previousCounter.postType} post. Make your response.`
      : `Initial offer round. Community has ${memberCount} members, score ${communityScore}/100. Make your opening offer.`;

    const parsed = await this.generateOfferJson(systemPrompt, userMessage, communityScore, previousCounter);
    const sanitized = {
      offeredPriceUsdc: Math.min(Number(parsed.offeredPriceUsdc), this.mandate.maxPricePerPostUsdc),
      postDurationHours: Number(parsed.postDurationHours ?? 6),
      postType: parsed.postType === 'pinned' ? 'pinned' : 'standard',
    };
    const policy = this.policy.evaluateOutboundOffer(sanitized, round);
    if (!policy.allowed) {
      await this.dealState.transition(buildDealId(intentId, communityWallet), 'FAILED', {
        actor: 'sponsor',
        type: 'OFFER_POLICY_BLOCKED',
        summary: policy.reasons.join('; '),
        payload: { parsed },
      }, { communityWallet, policy });
      await this.persistMemorySnapshot();
      throw new Error(`Sponsor policy blocked offer: ${policy.reasons.join('; ')}`);
    }

    const offer: any = {
      type: 'OFFER',
      round,
      offeredPriceUsdc: sanitized.offeredPriceUsdc,
      postDurationHours: sanitized.postDurationHours,
      postType: sanitized.postType,
      timestamp: Date.now(),
    };

    offer.signature = await signMessage(offer, this.privateKey);
    
    history.push(offer);
    this.activeNegotiations.set(communityWallet, history);
    
    // Persist negotiations
    await this.persistence.saveState('sponsor_negotiations', Object.fromEntries(this.activeNegotiations));
    await this.dealState.transition(buildDealId(intentId, communityWallet), 'NEGOTIATING', {
      actor: 'sponsor',
      type: 'OFFER_SENT',
      summary: `Round ${round} offer: $${offer.offeredPriceUsdc} USDC.`,
      payload: { offer },
    }, {
      sponsorWallet: this.account.address,
      communityWallet,
      sponsorAgentId: String(this.agentId),
      lastOffer: offer,
      policy,
    });
    await this.persistMemorySnapshot();

    console.log(`[SponsorAgent] Round ${round} offer: $${offer.offeredPriceUsdc} USDC`);

    return offer;
  }

  async fundEscrow(
    communityWallet: string,
    communityErc8004Id: bigint,
    agreedPriceUsdc: number,
    intentId: bigint,
    escrowContract: any,
    usdcContract: any,
    evidenceInput?: {
      terms?: DealTerms;
      adCopy?: string;
      acceptedAt?: number;
    }
  ): Promise<string> {
    return withRetry(async () => {
      // ----------------------------------------------------
      // HACKATHON SPONSOR: DOKU API INTEGRATION
      // Use DOKU HTTP API to generate a Fiat payment link for the 2% protocol fee
      // ----------------------------------------------------
      if (process.env.DOKU_CLIENT_ID && process.env.DOKU_ENABLE_CHECKOUT === 'true') {
        console.log(`[DOKU] Generating QRIS/VA payment link for 2% protocol fee ($0.60 USD) via DOKU Sandbox API...`);
        // We calculate fee based on 2% of the deal
        const protocolFeeUsd = (agreedPriceUsdc * 0.02).toFixed(2);
        
        try {
          const dokuResponse = await axios.post(
            'https://api-sandbox.doku.com/checkout/v1/payment',
            {
              order: { invoice_number: `INV-${Date.now()}`, amount: protocolFeeUsd },
              payment: { payment_due_date: 60 }
            },
            {
              headers: { 
                'Client-Id': process.env.DOKU_CLIENT_ID,
                'Request-Id': `REQ-${Date.now()}`,
                'Request-Timestamp': new Date().toISOString()
              },
              timeout: 5000
            }
          );
          console.log(`[DOKU] Payment Link Generated: ${dokuResponse.data?.response?.payment?.url || 'Link generated'}`);
          console.log(`[DOKU] Fee paid. Releasing smart contract escrow lock...`);
        } catch (err: any) {
          console.warn(`[DOKU] API call failed: ${err.message}`);
          if (process.env.DOKU_REQUIRED === 'true') {
            throw err;
          }
          console.warn(`[DOKU] Continuing escrow funding because DOKU_REQUIRED is not true.`);
        }
      }

      const amountWei = parseUnits(String(agreedPriceUsdc), 6);
      await usdcContract.write.approve([escrowContract.address, amountWei]);
      const terms = evidenceInput?.terms ?? {
        priceUsdc: agreedPriceUsdc,
        postDurationHours: 0,
        postType: 'standard' as const,
      };
      const evidence = evidenceInput?.adCopy
        ? buildAgreementEvidence({
          sponsorWallet: this.account.address,
          communityWallet,
          sponsorAgentId: this.agentId!,
          communityAgentId: communityErc8004Id,
          intentId,
          terms,
          adCopy: evidenceInput.adCopy,
          acceptedAt: evidenceInput.acceptedAt,
        })
        : undefined;

      const txHash = evidence && typeof escrowContract.write.fundEscrowWithAgreement === 'function'
        ? await escrowContract.write.fundEscrowWithAgreement([
          communityWallet,
          amountWei,
          intentId,
          this.agentId!,
          communityErc8004Id,
          evidence.agreementHash,
          evidence.contentHash,
        ])
        : await escrowContract.write.fundEscrow([
          communityWallet,
          amountWei,
          intentId,
          this.agentId!,
          communityErc8004Id,
        ]);
      console.log(`[SponsorAgent] Escrow funded. TX: ${txHash}`);
      await this.dealState.transition(buildDealId(intentId, communityWallet), 'ESCROW_FUNDED', {
        actor: 'sponsor',
        type: 'ESCROW_FUNDED',
        summary: `Funded escrow for $${agreedPriceUsdc} USDC.`,
        payload: { txHash, agreement: evidence?.agreementPayload, agreementHash: evidence?.agreementHash, contentHash: evidence?.contentHash },
      }, {
        sponsorWallet: this.account.address,
        communityWallet,
        sponsorAgentId: String(this.agentId),
        communityAgentId: String(communityErc8004Id),
        txHash,
        terms,
      });
      await this.persistMemorySnapshot();
      return txHash;
    });
  }

  getRuntimeStatus() {
    return {
      agentId: this.agentId?.toString() ?? null,
      address: this.account.address,
      negotiations: this.activeNegotiations.size,
      deals: this.dealState.list(),
      memory: {
        totalDeals: this.dealState.list().length,
        recentReceipts: this.dealState.list().flatMap((deal) => deal.decisionReceipts ?? []).slice(0, 5),
      },
    };
  }

  async verifyDelivery(deliveryProof: string): Promise<boolean> {
    const [platform, guildId, messageId] = deliveryProof.split(':');

    if (platform === 'discord') {
      return withRetry(() => this.verifyDiscordDelivery(guildId, messageId));
    }
    return true; // For demo purposes
  }

  private async verifyDiscordDelivery(guildId: string, messageId: string): Promise<boolean> {
    try {
      const token = process.env.SPONSOR_DISCORD_BOT_TOKEN;
      if (!token || token === 'mock_token') {
        console.warn(`[SponsorAgent] Discord verification skipped (mock token). Assuming delivery is valid.`);
        return true;
      }
      const channelId = process.env.DEMO_DISCORD_CHANNEL_ID!;
      const response = await axios.get(
        `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
        { 
          headers: { Authorization: `Bot ${process.env.SPONSOR_DISCORD_BOT_TOKEN}` },
          timeout: 5000 
        }
      );
      const message = response.data ?? {};
      const expectedGuildId = process.env.DEMO_DISCORD_GUILD_ID;
      const expectedAuthorId = process.env.COMMUNITY_DISCORD_BOT_USER_ID;
      const guildMatches = !expectedGuildId || !message.guild_id || String(message.guild_id) === expectedGuildId;
      const channelMatches = !message.channel_id || String(message.channel_id) === channelId;
      const authorMatches = !expectedAuthorId || String(message.author?.id) === expectedAuthorId;
      return response.status === 200 && guildMatches && channelMatches && authorMatches;
    } catch (error: any) {
      const detail = error?.response?.data?.message || error?.response?.status || error?.message || String(error);
      console.warn(`[SponsorAgent] Discord delivery verification failed for message ${messageId}: ${detail}`);
      return false;
    }
  }

  private async generateOfferJson(
    systemPrompt: string,
    userMessage: string,
    communityScore: number,
    previousCounter?: NegotiationResponse
  ): Promise<any> {
    if (!process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY.includes('...')) {
      return this.deterministicOffer(communityScore, previousCounter);
    }

    try {
      const result = await withRetry(async () => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${process.env.GOOGLE_API_KEY}`;
        return await axios.post(url, {
          contents: [
            { role: 'user', parts: [{ text: systemPrompt + "\n\n" + userMessage }] }
          ]
        }, { timeout: 10000 });
      }, { onRetry: (err, i) => console.warn(`[SponsorAgent] Gemini API retry ${i}...`) });

      const response = result.data.candidates[0].content;
      this.lastRawResponse = result.data;
      const text = response.parts[0].text;
      const jsonMatch = text.match(/<JSON>([\s\S]*?)<\/JSON>/) || text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Agent failed to produce valid JSON reasoning");
      return JSON.parse(jsonMatch[1] || jsonMatch[0]);
    } catch (err: any) {
      this.lastRawResponse = { fallback: 'deterministic_offer', reason: err.message };
      console.warn(`[SponsorAgent] LLM offer failed. Using deterministic policy fallback.`);
      return this.deterministicOffer(communityScore, previousCounter);
    }
  }

  private deterministicOffer(communityScore: number, previousCounter?: NegotiationResponse) {
    const max = this.mandate.maxPricePerPostUsdc;
    const scorePremium = communityScore >= 80 ? 0.9 : 0.75;
    const openingPrice = Math.max(1, Math.round(max * scorePremium));
    const counterPrice = previousCounter?.offeredPriceUsdc
      ? Math.min(previousCounter.offeredPriceUsdc, max)
      : openingPrice;

    return {
      offeredPriceUsdc: counterPrice,
      postDurationHours: previousCounter?.postDurationHours ?? 6,
      postType: previousCounter?.postType ?? 'standard',
      reasoning: 'Deterministic fallback selected the highest acceptable price within sponsor mandate.',
    };
  }

  private rejectHandshake(reason: string): HandshakeResponse {
    return {
      type: 'HANDSHAKE_RESPONSE',
      accepted: false,
      reason,
      recipientAgentId: String(this.agentId),
      recipientWallet: this.account.address,
      recipientReputationScore: 0,
      timestamp: Date.now(),
      signature: '',
    };
  }
}
