import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { AgentCard } from '../types/agentCard';

dotenv.config();

async function main() {
  const outDir = path.resolve('artifacts/agent-cards');
  await fs.mkdir(outDir, { recursive: true });

  const sponsorWallet = process.env.SPONSOR_WALLET_ADDRESS || '0xSponsorWallet';
  const communityWallet = process.env.COMMUNITY_WALLET_ADDRESS || '0xCommunityWallet';

  const sponsorCard: AgentCard = {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: 'AdMarket Sponsor Agent',
    description: 'Autonomous buyer agent for reputation-gated micro-sponsorships.',
    skills: [
      {
        id: 'intent.broadcast',
        name: 'Broadcast sponsorship intent',
        description: 'Publishes budget, audience requirements, content policy, and ad copy references.',
      },
      {
        id: 'negotiation.budgeted',
        name: 'Budget-constrained negotiation',
        description: 'Makes offers under deterministic max-price policy and signs each message.',
      },
      {
        id: 'escrow.fund',
        name: 'Agreement-bound escrow funding',
        description: 'Funds escrow with agreement and content hashes when supported by the escrow contract.',
      },
      {
        id: 'receipt.explain',
        name: 'Decision receipt emission',
        description: 'Emits action, reason, policy checks, risk, and proof links for every consequential step.',
      },
    ],
    endpoints: {
      a2a: process.env.SPONSOR_A2A_ENDPOINT || 'http://localhost:3001/sponsor/a2a',
      mcp: process.env.OPENCLAW_BRIDGE_ENDPOINT || 'http://localhost:4020/openclaw/tools',
    },
    walletAddress: sponsorWallet,
    admarket: {
      agentType: 'sponsor',
      contentPolicy: process.env.SPONSOR_CONTENT_POLICY || 'Web3 and AI products only. No gambling, no scams, no guaranteed returns.',
    },
  };

  const communityCard: AgentCard = {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: 'AdMarket Community Agent',
    description: 'Autonomous seller agent for community sponsorship inventory.',
    skills: [
      {
        id: 'intent.poll',
        name: 'Poll sponsor intents',
        description: 'Discovers active sponsorship intents and starts signed handshakes.',
      },
      {
        id: 'policy.evaluate',
        name: 'Deterministic policy evaluation',
        description: 'Rejects unsafe content, stale signatures, low reputation, and below-quote deals.',
      },
      {
        id: 'delivery.prove',
        name: 'Deliver and prove ads',
        description: 'Posts sponsored content and returns a signed delivery proof for settlement.',
      },
      {
        id: 'guardrail.reject',
        name: 'Pre-escrow malicious-content rejection',
        description: 'Rejects unsafe sponsor content before payment, delivery, or LLM negotiation spend.',
      },
    ],
    endpoints: {
      a2a: process.env.COMMUNITY_A2A_ENDPOINT || 'http://localhost:3002/community/a2a',
      mcp: process.env.OPENCLAW_BRIDGE_ENDPOINT || 'http://localhost:4020/openclaw/tools',
    },
    walletAddress: communityWallet,
    admarket: {
      agentType: 'community',
      platform: 'discord',
      memberCount: Number(process.env.COMMUNITY_MEMBER_COUNT ?? 847),
      contentPolicy: [
        'no gambling',
        'no scams',
        'no adult content',
        'no guaranteed returns',
      ].join('; '),
    },
  };

  const metadata = {
    proofSchema: 'admarket.proof.v1',
    generatedAt: new Date().toISOString(),
    note: 'These cards are intended to be uploaded to IPFS and used as ERC-8004 agentURI values.',
  };

  await fs.writeFile(path.join(outDir, 'sponsor-agent-card.json'), JSON.stringify({ ...sponsorCard, metadata }, null, 2));
  await fs.writeFile(path.join(outDir, 'community-agent-card.json'), JSON.stringify({ ...communityCard, metadata }, null, 2));

  console.log(`Wrote agent cards to ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
