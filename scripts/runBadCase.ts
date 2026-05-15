import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { CommunityAgent, CommunityMandate } from '../agents/communityAgent';
import { SponsorAgent, SponsorMandate } from '../agents/sponsorAgent';
import { writeProofBundle } from '../services/evidenceService';
import { HandshakeRequest, NegotiationOffer } from '../types/messages';
import { signMessage } from '../utils/signing';

dotenv.config();

function usablePrivateKey(value?: string): value is `0x${string}` {
  return Boolean(value && value.startsWith('0x') && !value.includes('...') && value.length === 66);
}

export async function runBadCase() {
  const sponsorKey = usablePrivateKey(process.env.SPONSOR_PRIVATE_KEY)
    ? process.env.SPONSOR_PRIVATE_KEY
    : generatePrivateKey();
  const communityKey = usablePrivateKey(process.env.COMMUNITY_PRIVATE_KEY)
    ? process.env.COMMUNITY_PRIVATE_KEY
    : generatePrivateKey();

  const sponsorAccount = privateKeyToAccount(sponsorKey);
  const communityAccount = privateKeyToAccount(communityKey);
  const sponsorAgentId = 11n;
  const communityAgentId = 12n;
  const intentId = `bad-${Date.now()}`;

  process.env.USE_MOCK_REPUTATION = 'true';
  process.env.GOOGLE_API_KEY = '';
  process.env.SPONSOR_WALLET_ADDRESS = sponsorAccount.address;
  process.env.COMMUNITY_WALLET_ADDRESS = communityAccount.address;

  const sponsorMandate: SponsorMandate = {
    budgetUsdc: 400,
    maxPricePerPostUsdc: 40,
    minMemberCount: 300,
    minReputationScore: 70,
    contentPolicy: 'Web3 and AI products only. No gambling, no scams, no guaranteed returns.',
    adCopy: 'Guaranteed 1000x casino jackpot. Risk free betting bonus today.',
    campaignName: 'Rejected Gambling Campaign',
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
  (sponsor as any).agentId = sponsorAgentId;
  (community as any).agentId = communityAgentId;
  (community as any).lastAdResetTimestamp = Date.now();
  (community as any).erc8004.getAgentWallet = async () => sponsorAccount.address;

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
  if (!handshakeResponse.accepted) {
    throw new Error(`Bad-case setup failed at handshake: ${handshakeResponse.reason}`);
  }

  const offer: NegotiationOffer = {
    type: 'OFFER',
    round: 1,
    offeredPriceUsdc: 40,
    postDurationHours: 6,
    postType: 'standard',
    timestamp: Date.now(),
    signature: '',
  };
  offer.signature = await signMessage(offer, sponsorKey);

  const response = await community.evaluateOffer(
    offer,
    sponsorMandate.adCopy,
    sponsorAccount.address,
    intentId,
    78,
  );

  const deal = community.getRuntimeStatus().deals.find((entry: any) => entry.dealId === `${intentId}:${sponsorAccount.address.toLowerCase()}`);
  let proofPath: string | undefined;
  let proofHash: string | undefined;
  if (deal) {
    const proof = await writeProofBundle(deal, {
      sponsorMandate,
      communityMandate,
      reputationSources: {
        sponsor: { score: 78, source: 'mock' },
        community: { score: 82, source: 'mock' },
      },
    });
    proofPath = proof.filePath;
    proofHash = proof.bundle.finalHash;
  }

  const result = {
    scenario: 'malicious-content-rejection',
    intentId,
    expected: 'Community Agent rejects before escrow funding.',
    actualDecision: response.type,
    reason: response.reason,
    proofPath,
    proofHash,
    receipts: deal?.decisionReceipts ?? [],
  };

  const outPath = path.resolve('cache', 'badcase-result.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(result, null, 2), 'utf-8');

  console.log('\n====== ADSOURCING BAD-CASE DEMO ======\n');
  console.log(`[BadCase] Decision: ${response.type}`);
  console.log(`[BadCase] Reason: ${response.reason}`);
  console.log(`[BadCase] Escrow funded: no`);
  console.log(`[BadCase] Result: ${outPath}`);

  return result;
}

if (require.main === module) {
  runBadCase().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
