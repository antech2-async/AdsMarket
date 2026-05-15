import express from 'express';
import { SponsorAgent } from '../agents/sponsorAgent';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const mandate = {
  budgetUsdc: Number(process.env.SPONSOR_MAX_PRICE_USDC) * 10,
  maxPricePerPostUsdc: Number(process.env.SPONSOR_MAX_PRICE_USDC),
  minMemberCount: Number(process.env.SPONSOR_MIN_MEMBERS),
  minReputationScore: Number(process.env.SPONSOR_MIN_COUNTERPARTY_SCORE),
  contentPolicy: "Web3 and crypto products only. No gambling. No scams.",
  adCopy: "🚀 Join the AdMarket Revolution! Decentralized sponsorship for micro-communities.",
  campaignName: "Launch Campaign"
};

const agent = new SponsorAgent(process.env.SPONSOR_PRIVATE_KEY as `0x${string}`, mandate);

// Initialize agent (registration + state recovery)
agent.initialize(
  process.env.SPONSOR_AGENT_CARD_URI ?? 'ipfs://QmSponsorCard',
  process.env.SPONSOR_ERC8004_AGENT_ID ? BigInt(process.env.SPONSOR_ERC8004_AGENT_ID) : undefined,
).catch(console.error);

app.post('/sponsor/a2a', async (req, res) => {
  try {
    const response = await agent.handleHandshake(req.body);
    res.json(response);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/sponsor/offer', async (req, res) => {
  try {
    const response = await agent.makeOffer(
      req.body.communityWallet,
      Number(req.body.communityScore),
      Number(req.body.memberCount),
      Number(req.body.round),
      req.body.previousCounter,
      req.body.intentId ?? 'manual',
    );
    res.json(response);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/sponsor/verify-delivery', async (req, res) => {
  try {
    const verified = await agent.verifyDelivery(req.body.deliveryProof);
    res.json({ verified });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/sponsor/status', (req, res) => {
  res.json(agent.getRuntimeStatus());
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`[SponsorServer] Listening on port ${PORT}`);
});

// Health check and status reporter
import { createHealthServer } from './healthServer';
createHealthServer(agent, 4001);
