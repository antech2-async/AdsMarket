import * as dotenv from 'dotenv';
import { SponsorAgent } from '../agents/sponsorAgent';
import { CommunityAgent } from '../agents/communityAgent';
import { HandshakeRequest } from '../types/messages';

dotenv.config();

async function runSimulation() {
  console.log('\n====== ADMARKET AUTONOMOUS AGENT SIMULATION ======\n');
  console.log(`Testing with ${process.env.GOOGLE_API_KEY ? 'Gemini 3 Flash Preview' : 'Mock Intelligence'}...\n`);

  if (!process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY.includes('...')) {
    console.error('Error: GOOGLE_API_KEY is not set correctly in .env');
    return;
  }

  // 1. Setup Mandates
  const sponsorMandate = {
    budgetUsdc: 400,
    maxPricePerPostUsdc: 40,
    minMemberCount: 300,
    minReputationScore: 70,
    contentPolicy: "Web3 and AI products only. No gambling, no adult content, no vague 'get rich quick' schemes.",
    adCopy: "Build the future of autonomous advertising with AdMarket Protocol. Secure, transparent, and agent-first.",
    campaignName: "AdMarket Launch"
  };

  const communityMandate = {
    platform: 'discord' as const,
    guildId: '123456789',
    channelId: '987654321',
    memberCount: 850,
    priceFloorUsdc: 25,
    minSponsorScore: 75,
    contentRules: ["no gambling", "no medical advice", "no offensive language"],
    maxAdsPerDay: 3
  };

  // 2. Initialize Agents using keys from .env
  const sponsorKey = process.env.SPONSOR_PRIVATE_KEY as `0x${string}`;
  const communityKey = process.env.COMMUNITY_PRIVATE_KEY as `0x${string}`;
  
  if (!sponsorKey || !communityKey || sponsorKey.includes('...')) {
    console.error('Error: Private keys missing in .env. Run generateKeys first.');
    return;
  }

  const sponsor = new SponsorAgent(sponsorKey, sponsorMandate);
  const community = new CommunityAgent(communityKey, communityMandate);

  // MOCK SERVICES ONLY (to avoid missing on-chain registries on local node)
  (sponsor as any).erc8004.getAgentWallet = async () => process.env.SPONSOR_WALLET_ADDRESS;
  (community as any).erc8004.getAgentWallet = async () => process.env.SPONSOR_WALLET_ADDRESS; // Sponsor is the one being verified in handshake
  (sponsor as any).erc8004.getReputationScore = async () => 85;
  (community as any).erc8004.getReputationScore = async () => 82;

  // We'll mock the agentId from env
  (sponsor as any).agentId = BigInt(process.env.SPONSOR_ERC8004_AGENT_ID || '1');
  (community as any).agentId = BigInt(process.env.COMMUNITY_ERC8004_AGENT_ID || '2');

  console.log('[Simulation] Agents initialized. Starting handshake...');

  // 3. Handshake
  const handshakeReq: HandshakeRequest = {
    type: 'HANDSHAKE_REQUEST',
    senderAgentId: process.env.SPONSOR_ERC8004_AGENT_ID!,
    senderWallet: process.env.SPONSOR_WALLET_ADDRESS!,
    senderReputationScore: 85,
    intentId: '101',
    timestamp: Date.now(),
    signature: '' // Will be signed below
  };

  const { signMessage } = require('../utils/signing');
  handshakeReq.signature = await signMessage(handshakeReq, sponsorKey);

  console.log('[Simulation] Sponsor -> Community Handshake...');
  const handshakeRes = await community.handleHandshakeRequest(handshakeReq);
  console.log(`[Simulation] Community Response: ${handshakeRes.accepted ? 'ACCEPTED' : 'REJECTED'}`);

  if (!handshakeRes.accepted) {
    console.log('Reason:', handshakeRes.reason);
    return;
  }

  // 4. Negotiation
  console.log('\n--- Starting Negotiation ---\n');

  let currentRound = 1;
  let lastResponse: any = null;
  let dealClosed = false;

  while (currentRound <= 3 && !dealClosed) {
    console.log(`\n[Round ${currentRound}] Sponsor is thinking...`);
    const offer = await sponsor.makeOffer(
      '0xCommunityWallet',
      82, // community score
      850, // community members
      currentRound,
      lastResponse
    );

    console.log(`[Round ${currentRound}] Sponsor Offer: $${offer.offeredPriceUsdc} USDC, ${offer.postDurationHours}h ${offer.postType}`);
    console.log(`[Sponsor RAW LLM Output]:\n${JSON.stringify((sponsor as any).lastRawResponse, null, 2)}`);

    console.log(`\n[Round ${currentRound}] Community is evaluating...`);
    const evaluation = await community.evaluateOffer(offer, 'ipfs://mock-ad-copy');
    console.log(`[Community RAW LLM Output]:\n${JSON.stringify((community as any).lastRawResponse, null, 2)}`);
    
    if (evaluation.type === 'ACCEPT') {
      console.log(`[Round ${currentRound}] Community: ACCEPTED the deal!`);
      dealClosed = true;
    } else if (evaluation.type === 'COUNTER') {
      console.log(`[Round ${currentRound}] Community: COUNTER-OFFER: $${evaluation.offeredPriceUsdc} USDC`);
      lastResponse = evaluation;
      currentRound++;
    } else {
      console.log(`[Round ${currentRound}] Community: REJECTED. Reason: ${evaluation.reason}`);
      break;
    }
  }

  if (dealClosed) {
    console.log('\n✅ DEAL SUCCESSFUL');
    console.log('Final Terms agreed by both autonomous agents.');
  } else {
    console.log('\n❌ DEAL FAILED');
    console.log('Agents could not reach an agreement.');
  }
}

runSimulation().catch(console.error);
