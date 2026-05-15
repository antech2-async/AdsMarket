import * as dotenv from 'dotenv';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { SponsorAgent, SponsorMandate } from '../agents/sponsorAgent';
import { CommunityAgent, CommunityMandate } from '../agents/communityAgent';
import { SettlementService } from '../services/settlementService';
import { writeProofBundle } from '../services/evidenceService';
import { buildPaymentReceipt, writePaymentReceipt } from '../services/paymentReceiptService';
import { HandshakeRequest, NegotiationResponse } from '../types/messages';
import { signMessage } from '../utils/signing';

dotenv.config();

function usablePrivateKey(value?: string): value is `0x${string}` {
  return Boolean(value && value.startsWith('0x') && !value.includes('...') && value.length === 66);
}

export async function runDemo() {
  const sponsorKey = usablePrivateKey(process.env.SPONSOR_PRIVATE_KEY)
    ? process.env.SPONSOR_PRIVATE_KEY
    : generatePrivateKey();
  const communityKey = usablePrivateKey(process.env.COMMUNITY_PRIVATE_KEY)
    ? process.env.COMMUNITY_PRIVATE_KEY
    : generatePrivateKey();

  const sponsorAccount = privateKeyToAccount(sponsorKey);
  const communityAccount = privateKeyToAccount(communityKey);

  process.env.USE_MOCK_REPUTATION = 'true';
  if (process.env.DEMO_USE_LLM !== 'true') {
    process.env.GOOGLE_API_KEY = '';
  }
  process.env.SPONSOR_WALLET_ADDRESS = sponsorAccount.address;
  process.env.COMMUNITY_WALLET_ADDRESS = communityAccount.address;

  const sponsorMandate: SponsorMandate = {
    budgetUsdc: 400,
    maxPricePerPostUsdc: 40,
    minMemberCount: 300,
    minReputationScore: 70,
    contentPolicy: "Web3 and AI products only. No gambling, no adult content, no guaranteed returns.",
    adCopy: "Build the future of autonomous advertising with AdMarket Protocol. Secure, transparent, and agent-first.",
    campaignName: "AdMarket Launch",
  };

  const communityMandate: CommunityMandate = {
    platform: 'telegram',
    guildId: 'demo-chat',
    channelId: 'demo-channel',
    memberCount: 847,
    priceFloorUsdc: 25,
    minSponsorScore: 70,
    contentRules: ['no gambling', 'no scams', 'no adult content', 'no guaranteed returns'],
    maxAdsPerDay: 3,
  };

  const sponsor = new SponsorAgent(sponsorKey, sponsorMandate);
  const community = new CommunityAgent(communityKey, communityMandate);
  const sponsorAgentId = 1n;
  const communityAgentId = 2n;
  const intentId = '101';

  (sponsor as any).agentId = sponsorAgentId;
  (community as any).agentId = communityAgentId;
  (community as any).lastAdResetTimestamp = Date.now();
  (sponsor as any).erc8004.getAgentWallet = async (agentId: bigint) =>
    agentId === sponsorAgentId ? sponsorAccount.address : communityAccount.address;
  (community as any).erc8004.getAgentWallet = async (agentId: bigint) =>
    agentId === sponsorAgentId ? sponsorAccount.address : communityAccount.address;
  (community as any).delivery.postToTelegram = async () => 'demo-message-0001';
  await sponsor.persistMandate();
  await community.persistMandate();

  console.log('\n====== ADMARKET AUTONOMOUS AGENT DEMO ======\n');
  console.log(`[Demo] Sponsor ${sponsorAccount.address} agentId=${sponsorAgentId}`);
  console.log(`[Demo] Community ${communityAccount.address} agentId=${communityAgentId}`);

  const handshake: HandshakeRequest = {
    type: 'HANDSHAKE_REQUEST',
    senderAgentId: sponsorAgentId.toString(),
    senderWallet: sponsorAccount.address,
    senderReputationScore: 78,
    intentId,
    timestamp: Date.now(),
    signature: '',
  };
  handshake.signature = await signMessage(handshake, sponsorKey);

  const handshakeResponse = await community.handleHandshakeRequest(handshake);
  console.log(`[Demo] Handshake: ${handshakeResponse.accepted ? 'accepted' : `rejected: ${handshakeResponse.reason}`}`);
  if (!handshakeResponse.accepted) return;

  let round = 1;
  let lastResponse: NegotiationResponse | undefined;
  let acceptedPrice = 0;
  let acceptedDuration = 0;
  let acceptedPostType: 'standard' | 'pinned' = 'standard';

  while (round <= 3) {
    const offer = await sponsor.makeOffer(
      communityAccount.address,
      handshakeResponse.recipientReputationScore,
      handshakeResponse.memberCount ?? communityMandate.memberCount,
      round,
      lastResponse,
      intentId,
    );
    console.log(`[Demo] Round ${round} sponsor offer: $${offer.offeredPriceUsdc} for ${offer.postDurationHours}h ${offer.postType}`);

    const evaluation = await community.evaluateOffer(offer, sponsorMandate.adCopy, sponsorAccount.address, intentId, 78);
    console.log(`[Demo] Round ${round} community decision: ${evaluation.type}${evaluation.offeredPriceUsdc ? ` at $${evaluation.offeredPriceUsdc}` : ''}`);

    if (evaluation.type === 'ACCEPT') {
      acceptedPrice = offer.offeredPriceUsdc;
      acceptedDuration = offer.postDurationHours;
      acceptedPostType = offer.postType;
      break;
    }
    if (evaluation.type === 'REJECT') return;

    lastResponse = evaluation;
    round++;
  }

  if (!acceptedPrice) {
    console.log('[Demo] No agreement reached.');
    return;
  }

  const mockUsdc = { write: { approve: async () => '0xapprove' } };
  const mockEscrow = {
    address: '0x0000000000000000000000000000000000008004',
    write: {
      fundEscrow: async () => '0xfundescrow',
      fundEscrowWithAgreement: async () => '0xfundescrow-agreement',
      logDelivery: async () => '0xlogdelivery',
      settle: async () => '0xsettle',
    },
  };

  const escrowTxHash = await sponsor.fundEscrow(
    communityAccount.address,
    communityAgentId,
    acceptedPrice,
    BigInt(intentId),
    mockEscrow,
    mockUsdc,
    {
      terms: {
        priceUsdc: acceptedPrice,
        postDurationHours: acceptedDuration,
        postType: acceptedPostType,
      },
      adCopy: sponsorMandate.adCopy,
    },
  );
  console.log(`[Demo] Escrow funded for $${acceptedPrice} (${acceptedDuration}h ${acceptedPostType}).`);

  const delivery = await community.postAd(sponsorMandate.adCopy, '1', mockEscrow);
  console.log(`[Demo] Delivery proof: ${delivery.deliveryProof}`);

  const settlement = new SettlementService();
  settlement.register({
    escrowId: '1',
    deliveryProof: 'telegram:demo-chat:demo-message-0001',
    settleAfterMs: 0,
    communityWallet: communityAccount.address,
    sponsorAgent: sponsor,
    escrowContract: mockEscrow,
    erc8004: {
      postFeedback: async (agentId: bigint, score: number, tag: string) => {
        console.log(`[Demo] Reputation feedback ${tag}: agent=${agentId} score=${score}`);
      },
    } as any,
    sponsorAgentId,
    communityAgentId,
  });
  await settlement.processSettlements();

  const sponsorDeal = sponsor.getRuntimeStatus().deals.find((deal: any) => deal.dealId === `${intentId}:${communityAccount.address.toLowerCase()}`);
  const communityDeal = community.getRuntimeStatus().deals.find((deal: any) => deal.dealId === `${intentId}:${sponsorAccount.address.toLowerCase()}`);
  const dealForProof = communityDeal ?? sponsorDeal;
  if (dealForProof) {
    const { bundle, filePath } = await writeProofBundle(dealForProof, {
      sponsorMandate,
      communityMandate,
      reputationSources: {
        sponsor: { score: 78, source: 'mock' },
        community: { score: 82, source: 'mock' },
      },
      chain: {
        name: 'Base Sepolia',
        chainId: 84532,
        escrowContract: mockEscrow.address,
        intentRegistry: process.env.INTENT_REGISTRY_ADDRESS,
      },
    });
    const paymentReceipt = buildPaymentReceipt({
      escrowId: '1',
      amountUsdc: acceptedPrice,
      status: 'SETTLED',
      txHashes: [escrowTxHash, delivery.txHash, '0xsettle'].filter(Boolean),
      proofHash: bundle.finalHash,
    });
    const paymentFile = await writePaymentReceipt(paymentReceipt);
    console.log(`[Demo] Proof bundle: ${filePath}`);
    console.log(`[Demo] Proof hash: ${bundle.finalHash}`);
    console.log(`[Demo] Payment receipt: ${paymentFile}`);
    console.log(`[Demo] Payment split: community $${paymentReceipt.communityPayoutUsdc}, protocol fee $${paymentReceipt.protocolFeeUsdc}`);
  }

  console.log('\n[Demo] Completed: handshake -> negotiation -> escrow -> delivery -> settlement.\n');
}

if (require.main === module) {
  runDemo().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
