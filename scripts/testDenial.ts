import * as dotenv from 'dotenv';
import { SponsorAgent } from '../agents/sponsorAgent';
import { CommunityAgent } from '../agents/communityAgent';
import { HandshakeRequest } from '../types/messages';
import { signMessage } from '../utils/signing';

dotenv.config();

async function runDenialSimulation() {
  console.log('\n====== ADMARKET DENIAL SIMULATION (Content Violation) ======\n');

  const sponsorKey = process.env.SPONSOR_PRIVATE_KEY as `0x${string}`;
  const communityKey = process.env.COMMUNITY_PRIVATE_KEY as `0x${string}`;

  // 1. Sponsor Mandate with SCAMMY ad copy
  const sponsorMandate = {
    budgetUsdc: 400,
    maxPricePerPostUsdc: 40,
    minMemberCount: 300,
    minReputationScore: 70,
    contentPolicy: "Crypto products",
    adCopy: "🎰 GET RICH QUICK! Guaranteed 1000x returns in our new decentralized casino! No risk, just pure profit. JOIN NOW!",
    campaignName: "Scam Campaign"
  };

  // 2. Community Mandate with STRICT rules
  const communityMandate = {
    platform: 'discord' as const,
    guildId: '123456789',
    channelId: '987654321',
    memberCount: 850,
    priceFloorUsdc: 25,
    minSponsorScore: 75,
    contentRules: ["NO GAMBLING", "NO SCAMS", "NO GUARANTEED RETURNS"],
    maxAdsPerDay: 3
  };

  const sponsor = new SponsorAgent(sponsorKey, sponsorMandate);
  const community = new CommunityAgent(communityKey, communityMandate);

  // Mocking registries
  (sponsor as any).erc8004.getAgentWallet = async () => process.env.SPONSOR_WALLET_ADDRESS;
  (community as any).erc8004.getAgentWallet = async () => process.env.SPONSOR_WALLET_ADDRESS;

  console.log('[Simulation] Starting Handshake...');
  const handshakeReq: HandshakeRequest = {
    type: 'HANDSHAKE_REQUEST',
    senderAgentId: '1',
    senderWallet: process.env.SPONSOR_WALLET_ADDRESS!,
    senderReputationScore: 85,
    intentId: '101',
    timestamp: Date.now(),
    signature: ''
  };
  handshakeReq.signature = await signMessage(handshakeReq, sponsorKey);

  const handshakeRes = await community.handleHandshakeRequest(handshakeReq);
  if (!handshakeRes.accepted) {
    console.log('[Simulation] Handshake Rejected:', handshakeRes.reason);
    return;
  }

  console.log('\n--- Starting Negotiation ---\n');

  // Sponsor makes a high offer to try and "bribe" the agent
  console.log('[Sponsor] Making high offer ($40) for a scam ad...');
  const offer = await sponsor.makeOffer(
    process.env.COMMUNITY_WALLET_ADDRESS!,
    82,
    850,
    1
  );

  console.log(`[Sponsor Offer]: $${offer.offeredPriceUsdc} USDC`);

  console.log('\n[Community] Evaluating ad copy against rules...');
  const evaluation = await community.evaluateOffer(offer, sponsorMandate.adCopy);
  
  console.log(`\n[Community Decision]: ${evaluation.type}`);
  console.log(`[Community Reason]: ${evaluation.reason}`);

  if (evaluation.type === 'REJECT') {
    console.log('\n🛡️ AGENT PROTECTION SUCCESSFUL: The Community Agent blocked a harmful ad.');
  }
}

runDenialSimulation().catch(console.error);
