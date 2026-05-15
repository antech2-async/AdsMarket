import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';
import { LiveChainService, liveAddress, livePrivateKey, parseUsdc, type LivePreflightResult } from '../services/liveChainService';

dotenv.config();

function envFlag(name: string): boolean {
  return process.env[name] === 'true';
}

async function main() {
  const strict = process.argv.includes('--strict') || envFlag('LIVE_STRICT');
  const addresses = {
    intentRegistry: liveAddress(process.env.INTENT_REGISTRY_ADDRESS, 'INTENT_REGISTRY_ADDRESS'),
    adEscrow: liveAddress(process.env.AD_ESCROW_ADDRESS, 'AD_ESCROW_ADDRESS'),
    usdc: liveAddress(process.env.USDC_CONTRACT_ADDRESS, 'USDC_CONTRACT_ADDRESS'),
  };

  const sponsorKey = livePrivateKey(process.env.SPONSOR_PRIVATE_KEY, 'SPONSOR_PRIVATE_KEY');
  const communityKey = livePrivateKey(process.env.COMMUNITY_PRIVATE_KEY, 'COMMUNITY_PRIVATE_KEY');
  const sponsor = new LiveChainService(sponsorKey);
  const community = new LiveChainService(communityKey);
  const maxPrice = Number(process.env.SPONSOR_MAX_PRICE_USDC ?? 0);
  const minGas = parseUsdc('0'); // Placeholder keeps the report explicit while ETH is checked separately.

  const results: LivePreflightResult[] = [];
  results.push(await sponsor.preflight(addresses, {
    label: 'sponsor',
    expectedWallet: process.env.SPONSOR_WALLET_ADDRESS ? liveAddress(process.env.SPONSOR_WALLET_ADDRESS, 'SPONSOR_WALLET_ADDRESS') : undefined,
    minEth: 1_000_000_000_000_000n,
    minUsdc: parseUsdc(maxPrice || 1),
  }));
  results.push(await community.preflight(addresses, {
    label: 'community',
    expectedWallet: process.env.COMMUNITY_WALLET_ADDRESS ? liveAddress(process.env.COMMUNITY_WALLET_ADDRESS, 'COMMUNITY_WALLET_ADDRESS') : undefined,
    minEth: 1_000_000_000_000_000n,
    minUsdc: minGas,
  }));

  const externalChecks = [
    {
      id: 'reputation.notMocked',
      ok: process.env.USE_MOCK_REPUTATION !== 'true',
      detail: `USE_MOCK_REPUTATION=${process.env.USE_MOCK_REPUTATION ?? 'unset'}`,
    },
    {
      id: 'discord.communityToken',
      ok: Boolean(process.env.COMMUNITY_DISCORD_BOT_TOKEN),
      detail: process.env.COMMUNITY_DISCORD_BOT_TOKEN ? 'Community Discord bot token is set.' : 'COMMUNITY_DISCORD_BOT_TOKEN is missing.',
    },
    {
      id: 'discord.sponsorToken',
      ok: Boolean(process.env.SPONSOR_DISCORD_BOT_TOKEN),
      detail: process.env.SPONSOR_DISCORD_BOT_TOKEN ? 'Sponsor Discord bot token is set.' : 'SPONSOR_DISCORD_BOT_TOKEN is missing.',
    },
    {
      id: 'discord.channel',
      ok: Boolean(process.env.DEMO_DISCORD_CHANNEL_ID && process.env.DEMO_DISCORD_GUILD_ID),
      detail: process.env.DEMO_DISCORD_CHANNEL_ID ? `Channel ${process.env.DEMO_DISCORD_CHANNEL_ID}` : 'Discord guild/channel is missing.',
    },
    {
      id: 'erc8004.agentIds',
      ok: Boolean(process.env.SPONSOR_ERC8004_AGENT_ID && process.env.COMMUNITY_ERC8004_AGENT_ID),
      detail: `Sponsor=${process.env.SPONSOR_ERC8004_AGENT_ID ?? 'unset'}, Community=${process.env.COMMUNITY_ERC8004_AGENT_ID ?? 'unset'}`,
    },
  ];

  const allChecks = [...results.flatMap((result) => result.checks), ...externalChecks];
  const ok = allChecks.every((check) => check.ok);
  const report = {
    ok,
    strict,
    generatedAt: Date.now(),
    checks: allChecks,
  };

  const outPath = path.resolve('cache', 'live-preflight.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(report, null, 2), 'utf-8');

  console.log('\n====== LIVE PREFLIGHT ======\n');
  for (const check of allChecks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.id}: ${check.detail}`);
  }
  console.log(`\nReport: ${outPath}`);

  if (!ok && strict) {
    throw new Error('Live preflight failed. Fix the failing checks before running live mode.');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
