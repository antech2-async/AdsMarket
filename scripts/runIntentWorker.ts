import * as dotenv from 'dotenv';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { SponsorAgent, SponsorMandate } from '../agents/sponsorAgent';
import { CommunityAgent, CommunityMandate } from '../agents/communityAgent';
import { IntentPollingWorker, MemoryIntentSource } from '../services/intentPollingWorker';

dotenv.config();

async function main() {
  process.env.USE_MOCK_REPUTATION = 'true';
  if (process.env.DEMO_USE_LLM !== 'true') process.env.GOOGLE_API_KEY = '';

  const sponsorKey = generatePrivateKey();
  const communityKey = generatePrivateKey();
  const sponsorAccount = privateKeyToAccount(sponsorKey);
  const communityAccount = privateKeyToAccount(communityKey);
  process.env.SPONSOR_WALLET_ADDRESS = sponsorAccount.address;
  process.env.COMMUNITY_WALLET_ADDRESS = communityAccount.address;

  const sponsorMandate: SponsorMandate = {
    budgetUsdc: 400,
    maxPricePerPostUsdc: 40,
    minMemberCount: 300,
    minReputationScore: 70,
    contentPolicy: 'No gambling, no scams, no guaranteed returns.',
    adCopy: 'Legitimate autonomous sponsorship launch.',
    campaignName: 'Launch',
  };
  const communityMandate: CommunityMandate = {
    platform: 'telegram',
    guildId: 'demo',
    channelId: 'demo',
    memberCount: 847,
    priceFloorUsdc: 25,
    minSponsorScore: 70,
    contentRules: ['no gambling', 'no scams', 'no adult content', 'no guaranteed returns'],
    maxAdsPerDay: 3,
  };

  const sponsorAgent = new SponsorAgent(sponsorKey, sponsorMandate);
  const communityAgent = new CommunityAgent(communityKey, communityMandate);
  (sponsorAgent as any).agentId = 1n;
  (communityAgent as any).agentId = 2n;
  (communityAgent as any).lastAdResetTimestamp = Date.now();
  (sponsorAgent as any).erc8004.getAgentWallet = async (agentId: bigint) =>
    agentId === 1n ? sponsorAccount.address : communityAccount.address;
  (communityAgent as any).erc8004.getAgentWallet = async (agentId: bigint) =>
    agentId === 1n ? sponsorAccount.address : communityAccount.address;

  const source = new MemoryIntentSource([
    {
      intentId: 'worker-101',
      sponsorWallet: sponsorAccount.address,
      sponsorAgentId: '1',
      maxBudgetUsdc: 40,
      minMemberCount: 300,
      contentPolicy: sponsorMandate.contentPolicy,
      adCopy: sponsorMandate.adCopy,
      sponsorScore: 78,
    },
  ]);
  const worker = new IntentPollingWorker(source, sponsorAgent, communityAgent, communityAccount.address);

  console.log('\n====== ADMARKET INTENT WORKER ======\n');
  const results = await worker.runOnce();
  for (const result of results) {
    console.log(`${result.status.toUpperCase()} intent=${result.intentId}${result.reason ? ` reason=${result.reason}` : ''}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
