import express from 'express';
import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';
import { runDemo } from '../scripts/runDemo';
import { runBadCase } from '../scripts/runBadCase';
import { runAgenthonLocal } from '../scripts/runAgenthonLocal';
import { AgentMemoryService } from '../services/agentMemoryService';
import { AgentTheaterService } from '../services/agentTheaterService';
import { CACHE_DIR } from '../services/pathConfig';

dotenv.config();

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.OPENCLAW_BRIDGE_PORT ?? 4020);
const memory = new AgentMemoryService();
const theater = new AgentTheaterService();

const tools = [
  {
    name: 'adsourcing_status',
    description: 'Return current AdSourcing agent mandates, deal memory, policy receipts, proofs, payment receipts, and bad-case status.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'adsourcing_run_happy_path',
    description: 'Run the full autonomous sponsorship loop: handshake, negotiation, escrow, delivery, settlement, proof bundle, payment receipt.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'adsourcing_run_bad_case',
    description: 'Run the guardrail demo where malicious ad copy is rejected before escrow funding.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'adsourcing_run_agenthon_local',
    description: 'Run the middle-ground Agenthon mode: local funded chain, real contracts, signed agents, optional real Discord bot delivery, proof and payment receipts.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        allowLocalDelivery: { type: 'boolean' },
      },
    },
  },
  {
    name: 'adsourcing_save_sponsor_mandate',
    description: 'Persist a sponsor mandate for future OpenClaw-controlled agent runs.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['wallet', 'mandate'],
      properties: {
        wallet: { type: 'string' },
        agentId: { type: 'string' },
        mandate: { type: 'object' },
      },
    },
  },
  {
    name: 'adsourcing_save_community_mandate',
    description: 'Persist a community mandate for future OpenClaw-controlled agent runs.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['wallet', 'mandate'],
      properties: {
        wallet: { type: 'string' },
        agentId: { type: 'string' },
        mandate: { type: 'object' },
      },
    },
  },
  {
    name: 'adsourcing_get_evidence',
    description: 'Return recent proof bundles and payment receipts for judge-facing evidence.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'adsourcing_theater_status',
    description: 'Inspect the two-party SponsorAgent and CommunityAgent theater state.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'adsourcing_theater_reset',
    description: 'Initialize the two-party theater with local contracts, two wallets, two agents, and optional local delivery.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        allowLocalDelivery: { type: 'boolean' },
      },
    },
  },
  {
    name: 'adsourcing_sponsor_broadcast',
    description: 'Sponsor Agent broadcasts a campaign intent to the local registry.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'adsourcing_community_handshake',
    description: 'Community Agent verifies the sponsor handshake, score, wallet binding, and inventory.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'adsourcing_sponsor_offer',
    description: 'Sponsor Agent makes a signed offer within mandate constraints.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'adsourcing_community_decide',
    description: 'Community Agent evaluates the offer against price and content policy.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'adsourcing_sponsor_fund',
    description: 'Sponsor Agent funds escrow after accepted terms.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'adsourcing_community_deliver',
    description: 'Community Agent delivers the ad and logs delivery proof.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'adsourcing_sponsor_settle',
    description: 'Sponsor Agent verifies delivery and settles escrow.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  },
];

app.get('/openclaw/health', (_req, res) => {
  res.json({ ok: true, service: 'adsourcing-openclaw-bridge', tools: tools.map((tool) => tool.name) });
});

app.get('/openclaw/tools', (_req, res) => {
  res.json({ tools });
});

app.post('/openclaw/tools/:toolName', async (req, res) => {
  try {
    const result = await executeTool(req.params.toolName, req.body ?? {});
    res.json({ ok: true, result });
  } catch (error: any) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

async function executeTool(toolName: string, params: any) {
  switch (toolName) {
    case 'adsourcing_status':
      return readStatus();
    case 'adsourcing_run_happy_path':
      await runDemo();
      return readStatus();
    case 'adsourcing_run_bad_case':
      await runBadCase();
      return readStatus();
    case 'adsourcing_run_agenthon_local':
      if (params.allowLocalDelivery === true) process.env.AGENTHON_ALLOW_LOCAL_DELIVERY = 'true';
      await runAgenthonLocal();
      return readStatus();
    case 'adsourcing_save_sponsor_mandate':
      return memory.saveMandate({
        role: 'sponsor',
        wallet: requiredString(params.wallet, 'wallet'),
        agentId: params.agentId,
        mandate: params.mandate,
      });
    case 'adsourcing_save_community_mandate':
      return memory.saveMandate({
        role: 'community',
        wallet: requiredString(params.wallet, 'wallet'),
        agentId: params.agentId,
        mandate: params.mandate,
      });
    case 'adsourcing_get_evidence':
      return readEvidence(Number(params.limit ?? 5));
    case 'adsourcing_theater_status':
      return theater.status();
    case 'adsourcing_theater_reset':
      return theater.reset({ allowLocalDelivery: params.allowLocalDelivery !== false });
    case 'adsourcing_sponsor_broadcast':
      return theater.sponsorBroadcast();
    case 'adsourcing_community_handshake':
      return theater.communityHandshake();
    case 'adsourcing_sponsor_offer':
      return theater.sponsorOffer();
    case 'adsourcing_community_decide':
      return theater.communityDecide();
    case 'adsourcing_sponsor_fund':
      return theater.sponsorFund();
    case 'adsourcing_community_deliver':
      return theater.communityDeliver();
    case 'adsourcing_sponsor_settle':
      return theater.sponsorSettle();
    default:
      throw new Error(`Unknown OpenClaw bridge tool: ${toolName}`);
  }
}

async function readStatus() {
  const [sponsorMandate, communityMandate, sponsorMemory, communityMemory, mem9, evidence, badCase] = await Promise.all([
    readJson(path.join(CACHE_DIR, 'sponsor_mandate.json'), null),
    readJson(path.join(CACHE_DIR, 'community_mandate.json'), null),
    readJson(path.join(CACHE_DIR, 'sponsor_memory.json'), null),
    readJson(path.join(CACHE_DIR, 'community_memory.json'), null),
    memory.mem9Status(),
    readEvidence(5),
    readJson(path.join(CACHE_DIR, 'badcase-result.json'), null),
  ]);

  return {
    generatedAt: Date.now(),
    sponsorMandate,
    communityMandate,
    sponsorMemory,
    communityMemory,
    mem9,
    evidence,
    badCase,
  };
}

async function readEvidence(limit: number) {
  const [proofs, payments] = await Promise.all([
    listJson(path.join(CACHE_DIR, 'proofs'), '.proof.json'),
    listJson(path.join(CACHE_DIR, 'payment-receipts'), '.payment.json'),
  ]);

  return {
    proofs: proofs.slice(0, limit),
    payments: payments.slice(0, limit),
  };
}

async function listJson(dir: string, suffix: string) {
  try {
    const files = (await fs.readdir(dir)).filter((file) => file.endsWith(suffix));
    const rows = await Promise.all(files.map((file) => readJson(path.join(dir, file), null)));
    return rows
      .filter(Boolean)
      .sort((a: any, b: any) => Number(b.generatedAt ?? b.updatedAt ?? 0) - Number(a.generatedAt ?? a.updatedAt ?? 0));
  } catch {
    return [];
  }
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[OpenClawBridge] Listening on http://localhost:${PORT}/openclaw`);
  });
}

export { app as openclawBridgeApp, executeTool };
