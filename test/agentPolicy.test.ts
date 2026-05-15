import { expect } from 'chai';
import { CommunityPolicy, SponsorPolicy } from '../services/policyService';
import { signMessage, verifySignature } from '../utils/signing';
import type { NegotiationOffer } from '../types/messages';

const PRIVATE_KEY = '0x59c6995e998f97a5a0044966f094538ddb5dd5b89e3b9d69ba1a2b414f5adfcb' as const;
const WALLET = '0x983961Bc1358007AB14D3879D944FE06E4F34a0E';

describe('agent policy and signing', () => {
  it('verifies signatures independent of object key insertion order', async () => {
    const payload = {
      type: 'HANDSHAKE_REQUEST',
      senderAgentId: '1',
      senderWallet: WALLET,
      senderReputationScore: 80,
      intentId: 'intent-1',
      timestamp: Date.now(),
      signature: '',
    };
    const signature = await signMessage(payload, PRIVATE_KEY);

    const reorderedPayload = {
      signature: '',
      timestamp: payload.timestamp,
      intentId: payload.intentId,
      senderReputationScore: payload.senderReputationScore,
      senderWallet: payload.senderWallet,
      senderAgentId: payload.senderAgentId,
      type: payload.type,
    };

    expect(await verifySignature(reorderedPayload, signature, WALLET, { requireTimestamp: true })).to.equal(true);
  });

  it('rejects stale signed payloads', async () => {
    const stalePayload = {
      type: 'HANDSHAKE_REQUEST',
      senderAgentId: '1',
      senderWallet: WALLET,
      senderReputationScore: 80,
      intentId: 'intent-1',
      timestamp: Date.now() - 10 * 60 * 1000,
      signature: '',
    };
    const signature = await signMessage(stalePayload, PRIVATE_KEY);

    expect(await verifySignature(stalePayload, signature, WALLET, { requireTimestamp: true })).to.equal(false);
  });

  it('blocks obvious content violations before model evaluation', () => {
    const policy = new CommunityPolicy({
      platform: 'discord',
      guildId: 'guild',
      channelId: 'channel',
      memberCount: 847,
      priceFloorUsdc: 25,
      minSponsorScore: 70,
      contentRules: ['no gambling', 'no scams', 'no guaranteed returns'],
      maxAdsPerDay: 3,
    });
    const offer: NegotiationOffer = {
      type: 'OFFER',
      round: 1,
      offeredPriceUsdc: 100,
      postDurationHours: 6,
      postType: 'standard',
      timestamp: Date.now(),
      signature: '0x',
    };

    const decision = policy.evaluateIncomingOffer(
      offer,
      'GET RICH QUICK with guaranteed returns and no risk in our casino.',
    );

    expect(decision.allowed).to.equal(false);
    expect(decision.reasons.join(' ')).to.include('blocked rule');
  });

  it('prevents sponsor offers above mandate budget', () => {
    const policy = new SponsorPolicy({
      budgetUsdc: 400,
      maxPricePerPostUsdc: 40,
      minMemberCount: 300,
      minReputationScore: 70,
      contentPolicy: 'No scams.',
      adCopy: 'Legitimate launch copy.',
      campaignName: 'Launch',
    });

    const decision = policy.evaluateOutboundOffer({
      offeredPriceUsdc: 41,
      postDurationHours: 6,
      postType: 'standard',
    }, 1);

    expect(decision.allowed).to.equal(false);
    expect(decision.reasons.join(' ')).to.include('maximum price');
  });
});
