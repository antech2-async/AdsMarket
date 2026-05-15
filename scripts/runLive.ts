import * as dotenv from 'dotenv';
import { SponsorAgent, SponsorMandate } from '../agents/sponsorAgent';
import { CommunityAgent, CommunityMandate } from '../agents/communityAgent';
import { SettlementService } from '../services/settlementService';
import { writeProofBundle } from '../services/evidenceService';
import { buildPaymentReceipt, writePaymentReceipt } from '../services/paymentReceiptService';
import { LiveChainService, liveAddress, livePrivateKey, parseUsdc } from '../services/liveChainService';
import { NegotiationResponse } from '../types/messages';

dotenv.config();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.includes('...')) throw new Error(`${name} is required for live mode`);
  return value;
}

function buildSponsorMandate(): SponsorMandate {
  return {
    budgetUsdc: Number(process.env.SPONSOR_BUDGET_USDC ?? Number(process.env.SPONSOR_MAX_PRICE_USDC ?? 40) * 10),
    maxPricePerPostUsdc: Number(requireEnv('SPONSOR_MAX_PRICE_USDC')),
    minMemberCount: Number(requireEnv('SPONSOR_MIN_MEMBERS')),
    minReputationScore: Number(requireEnv('SPONSOR_MIN_COUNTERPARTY_SCORE')),
    contentPolicy: process.env.SPONSOR_CONTENT_POLICY ?? 'Web3 and AI products only. No gambling, no scams, no guaranteed returns.',
    adCopy: process.env.SPONSOR_AD_COPY ?? 'AdSourcing live test: autonomous agent sponsorship with escrowed payment and proof receipt.',
    campaignName: process.env.SPONSOR_CAMPAIGN_NAME ?? 'AdSourcing Live Campaign',
  };
}

function buildCommunityMandate(): CommunityMandate {
  return {
    platform: 'discord',
    guildId: requireEnv('DEMO_DISCORD_GUILD_ID'),
    channelId: requireEnv('DEMO_DISCORD_CHANNEL_ID'),
    memberCount: Number(process.env.COMMUNITY_MEMBER_COUNT ?? 847),
    priceFloorUsdc: Number(requireEnv('COMMUNITY_PRICE_FLOOR_USDC')),
    minSponsorScore: Number(requireEnv('COMMUNITY_MIN_SPONSOR_SCORE')),
    contentRules: (process.env.COMMUNITY_CONTENT_RULES ?? 'no gambling; no scams; no adult content; no guaranteed returns')
      .split(';')
      .map((rule) => rule.trim())
      .filter(Boolean),
    maxAdsPerDay: Number(requireEnv('COMMUNITY_MAX_ADS_PER_DAY')),
  };
}

export async function runLive() {
  process.env.USE_MOCK_REPUTATION = 'false';

  const sponsorKey = livePrivateKey(process.env.SPONSOR_PRIVATE_KEY, 'SPONSOR_PRIVATE_KEY');
  const communityKey = livePrivateKey(process.env.COMMUNITY_PRIVATE_KEY, 'COMMUNITY_PRIVATE_KEY');
  const intentRegistryAddress = liveAddress(process.env.INTENT_REGISTRY_ADDRESS, 'INTENT_REGISTRY_ADDRESS');
  const adEscrowAddress = liveAddress(process.env.AD_ESCROW_ADDRESS, 'AD_ESCROW_ADDRESS');
  const usdcAddress = liveAddress(process.env.USDC_CONTRACT_ADDRESS, 'USDC_CONTRACT_ADDRESS');
  const sponsorAgentId = BigInt(requireEnv('SPONSOR_ERC8004_AGENT_ID'));
  const communityAgentId = BigInt(requireEnv('COMMUNITY_ERC8004_AGENT_ID'));

  requireEnv('COMMUNITY_DISCORD_BOT_TOKEN');
  requireEnv('SPONSOR_DISCORD_BOT_TOKEN');

  const sponsorMandate = buildSponsorMandate();
  const communityMandate = buildCommunityMandate();
  const sponsorChain = new LiveChainService(sponsorKey);
  const communityChain = new LiveChainService(communityKey);
  const sponsor = new SponsorAgent(sponsorKey, sponsorMandate);
  const community = new CommunityAgent(communityKey, communityMandate);

  await sponsor.initialize(process.env.SPONSOR_AGENT_CARD_URI ?? 'ipfs://QmSponsorCard', sponsorAgentId);
  await community.initialize(process.env.COMMUNITY_AGENT_CARD_URI ?? 'ipfs://QmCommunityCard', communityAgentId);

  const maxAmountWei = parseUsdc(sponsorMandate.maxPricePerPostUsdc);
  const sponsorBalance = await sponsorChain.usdcBalance(usdcAddress, sponsorChain.account.address);
  if (sponsorBalance < maxAmountWei) {
    throw new Error(`Sponsor wallet has ${Number(sponsorBalance) / 1_000_000} USDC, needs at least ${sponsorMandate.maxPricePerPostUsdc}.`);
  }

  console.log('\n====== ADSOURCING LIVE MODE ======\n');
  console.log(`[Live] Sponsor wallet ${sponsorChain.account.address}`);
  console.log(`[Live] Community wallet ${communityChain.account.address}`);

  const intentRegistry = sponsorChain.intentRegistry(intentRegistryAddress);
  const intentTx = await intentRegistry.write.broadcastIntent([
    sponsorAgentId,
    parseUsdc(sponsorMandate.maxPricePerPostUsdc),
    BigInt(sponsorMandate.minMemberCount),
    process.env.SPONSOR_CONTENT_POLICY_URI ?? 'inline://sponsor-content-policy',
    process.env.SPONSOR_AD_COPY_URI ?? sponsorMandate.adCopy,
    BigInt(Number(process.env.INTENT_TTL_SECONDS ?? 3600)),
  ]);
  const intentId = await sponsorChain.parseIntentId(intentTx);
  console.log(`[Live] Intent broadcast id=${intentId} tx=${intentTx}`);

  const handshake = await sponsor.createHandshakeRequest(intentId);
  const handshakeResponse = await community.handleHandshakeRequest(handshake);
  console.log(`[Live] Handshake: ${handshakeResponse.accepted ? 'accepted' : `rejected: ${handshakeResponse.reason}`}`);
  if (!handshakeResponse.accepted) return;

  let round = 1;
  let lastResponse: NegotiationResponse | undefined;
  let acceptedPrice = 0;
  let acceptedDuration = 0;
  let acceptedPostType: 'standard' | 'pinned' = 'standard';

  while (round <= 3) {
    const offer = await sponsor.makeOffer(
      communityChain.account.address,
      handshakeResponse.recipientReputationScore,
      handshakeResponse.memberCount ?? communityMandate.memberCount,
      round,
      lastResponse,
      intentId,
    );
    console.log(`[Live] Round ${round} offer: $${offer.offeredPriceUsdc} ${offer.postType}`);

    const evaluation = await community.evaluateOffer(
      offer,
      sponsorMandate.adCopy,
      sponsorChain.account.address,
      intentId,
      handshake.senderReputationScore,
    );
    console.log(`[Live] Round ${round} community decision: ${evaluation.type}`);

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

  if (!acceptedPrice) throw new Error('No live agreement reached.');

  const disputeWindowSeconds = BigInt(Number(process.env.DISPUTE_WINDOW_SECONDS ?? 60));
  try {
    await sponsorChain.adEscrow(adEscrowAddress).write.setDisputeWindow([disputeWindowSeconds]);
    console.log(`[Live] Dispute window set to ${disputeWindowSeconds}s.`);
  } catch (error: any) {
    console.warn(`[Live] Could not set dispute window, continuing with existing value: ${error.shortMessage ?? error.message}`);
  }

  const escrowSponsor = sponsorChain.adEscrow(adEscrowAddress);
  const usdcSponsor = sponsorChain.erc20(usdcAddress);
  const escrowTx = await sponsor.fundEscrow(
    communityChain.account.address,
    communityAgentId,
    acceptedPrice,
    intentId,
    escrowSponsor,
    usdcSponsor,
    {
      terms: {
        priceUsdc: acceptedPrice,
        postDurationHours: acceptedDuration,
        postType: acceptedPostType,
      },
      adCopy: sponsorMandate.adCopy,
    },
  );
  const escrowId = await sponsorChain.parseEscrowId(escrowTx as `0x${string}`);
  console.log(`[Live] Escrow funded id=${escrowId} tx=${escrowTx}`);

  const delivery = await community.postAd(sponsorMandate.adCopy, escrowId.toString(), communityChain.adEscrow(adEscrowAddress));
  console.log(`[Live] Discord delivery proof: ${delivery.deliveryProof}`);

  const waitMs = Number(disputeWindowSeconds) * 1000 + 3_000;
  console.log(`[Live] Waiting ${waitMs}ms for optimistic settlement window.`);
  await sleep(waitMs);

  const settlement = new SettlementService();
  settlement.register({
    escrowId: escrowId.toString(),
    deliveryProof: delivery.deliveryProof,
    settleAfterMs: 0,
    communityWallet: communityChain.account.address,
    sponsorAgent: sponsor,
    escrowContract: escrowSponsor,
    erc8004: (sponsor as any).erc8004,
    sponsorAgentId,
    communityAgentId,
  });
  await settlement.processSettlements();

  const communityDeal = community.getRuntimeStatus().deals.find((deal: any) => deal.dealId === `${intentId}:${sponsorChain.account.address.toLowerCase()}`);
  if (communityDeal) {
    const proof = await writeProofBundle(communityDeal, {
      sponsorMandate,
      communityMandate,
      reputationSources: {
        sponsor: { source: 'erc8004-or-openclaw-fallback' },
        community: { source: 'erc8004-or-openclaw-fallback' },
      },
      chain: {
        name: 'Base Sepolia',
        chainId: 84532,
        escrowContract: adEscrowAddress,
        intentRegistry: intentRegistryAddress,
      },
    });
    const paymentReceipt = buildPaymentReceipt({
      escrowId: escrowId.toString(),
      amountUsdc: acceptedPrice,
      status: 'SETTLED',
      txHashes: [intentTx, escrowTx, delivery.txHash].filter(Boolean),
      proofHash: proof.bundle.finalHash,
    });
    const paymentPath = await writePaymentReceipt(paymentReceipt);
    console.log(`[Live] Proof bundle: ${proof.filePath}`);
    console.log(`[Live] Payment receipt: ${paymentPath}`);
  }
}

if (require.main === module) {
  runLive().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
