import * as dotenv from 'dotenv';
import { ERC8004Service } from '../services/erc8004Service';

dotenv.config();

async function register(label: string, privateKey: `0x${string}`, cardUri: string): Promise<bigint> {
  const service = new ERC8004Service(privateKey);
  const agentId = await service.registerAgent(cardUri);
  console.log(`${label}_ERC8004_AGENT_ID=${agentId.toString()}`);
  return agentId;
}

async function main() {
  const sponsorKey = process.env.SPONSOR_PRIVATE_KEY as `0x${string}` | undefined;
  const communityKey = process.env.COMMUNITY_PRIVATE_KEY as `0x${string}` | undefined;

  if (!sponsorKey || sponsorKey.includes('...')) {
    throw new Error('SPONSOR_PRIVATE_KEY is missing. Run npm exec ts-node scripts/generateKeys.ts first.');
  }
  if (!communityKey || communityKey.includes('...')) {
    throw new Error('COMMUNITY_PRIVATE_KEY is missing. Run npm exec ts-node scripts/generateKeys.ts first.');
  }

  if (process.env.SPONSOR_ERC8004_AGENT_ID && process.env.COMMUNITY_ERC8004_AGENT_ID) {
    console.log('Agent IDs already present in .env. Skipping registration.');
    console.log(`SPONSOR_ERC8004_AGENT_ID=${process.env.SPONSOR_ERC8004_AGENT_ID}`);
    console.log(`COMMUNITY_ERC8004_AGENT_ID=${process.env.COMMUNITY_ERC8004_AGENT_ID}`);
    return;
  }

  await register('SPONSOR', sponsorKey, process.env.SPONSOR_AGENT_CARD_URI ?? 'ipfs://QmSponsorCard');
  await register('COMMUNITY', communityKey, process.env.COMMUNITY_AGENT_CARD_URI ?? 'ipfs://QmCommunityCard');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
