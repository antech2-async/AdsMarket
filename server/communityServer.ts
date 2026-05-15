import express from 'express';
import { CommunityAgent } from '../agents/communityAgent';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const mandate: any = {
  platform: 'discord',
  guildId: process.env.DEMO_DISCORD_GUILD_ID,
  channelId: process.env.DEMO_DISCORD_CHANNEL_ID,
  memberCount: 847,
  priceFloorUsdc: Number(process.env.COMMUNITY_PRICE_FLOOR_USDC),
  minSponsorScore: Number(process.env.COMMUNITY_MIN_SPONSOR_SCORE),
  contentRules: ["no gambling", "no adult content"],
  maxAdsPerDay: Number(process.env.COMMUNITY_MAX_ADS_PER_DAY)
};

const agent = new CommunityAgent(process.env.COMMUNITY_PRIVATE_KEY as `0x${string}`, mandate);

// Initialize agent (registration + state recovery)
agent.initialize(
  process.env.COMMUNITY_AGENT_CARD_URI ?? 'ipfs://QmCommunityCard',
  process.env.COMMUNITY_ERC8004_AGENT_ID ? BigInt(process.env.COMMUNITY_ERC8004_AGENT_ID) : undefined,
).catch(console.error);

app.post('/community/a2a', async (req, res) => {
  try {
    const response = await agent.handleHandshakeRequest(req.body);
    res.json(response);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/community/evaluate', async (req, res) => {
  try {
    const response = await agent.evaluateOffer(
      req.body.offer,
      req.body.adCopyUri,
      req.body.sponsorWallet,
      req.body.intentId ?? 'manual',
      Number(req.body.sponsorScore ?? 78),
    );
    res.json(response);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/community/deliver', async (req, res) => {
  try {
    const response = await agent.postAd(req.body.adCopy, String(req.body.escrowId));
    res.json(response);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/community/status', (req, res) => {
  res.json(agent.getRuntimeStatus());
});

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`[CommunityServer] Listening on port ${PORT}`);
});

// Health check and status reporter
import { createHealthServer } from './healthServer';
createHealthServer(agent, 4002);
