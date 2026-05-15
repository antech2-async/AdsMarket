import * as fs from 'fs/promises';
import * as path from 'path';
import type { SponsorMandate } from '../agents/sponsorAgent';
import type { CommunityMandate } from '../agents/communityAgent';
import { CACHE_DIR } from './pathConfig';

type SavedMandate<T> = {
  role: 'sponsor' | 'community';
  wallet: string;
  agentId?: string;
  mandate: T;
  updatedAt: number;
};

export type ConfiguredMandates = {
  sponsorMandate: SponsorMandate;
  communityMandate: CommunityMandate;
  sponsorSnapshot: SavedMandate<SponsorMandate> | null;
  communitySnapshot: SavedMandate<CommunityMandate> | null;
};

const sponsorFile = path.join(CACHE_DIR, 'sponsor_mandate.json');
const communityFile = path.join(CACHE_DIR, 'community_mandate.json');

export function defaultSponsorMandate(): SponsorMandate {
  return {
    budgetUsdc: Number(process.env.SPONSOR_BUDGET_USDC ?? 400),
    maxPricePerPostUsdc: Number(process.env.SPONSOR_MAX_PRICE_USDC ?? 40),
    minMemberCount: Number(process.env.SPONSOR_MIN_MEMBERS ?? 300),
    minReputationScore: Number(process.env.SPONSOR_MIN_COUNTERPARTY_SCORE ?? 70),
    contentPolicy: process.env.SPONSOR_CONTENT_POLICY ?? 'Web3 and AI products only. No gambling, no scams, no guaranteed returns.',
    adCopy: process.env.SPONSOR_AD_COPY ?? 'AdSourcing two-agent theater: OpenClaw sponsor and community agents close a real escrowed ad slot.',
    campaignName: process.env.SPONSOR_CAMPAIGN_NAME ?? 'Two-Agent Theater Campaign',
  };
}

export function defaultCommunityMandate(): CommunityMandate {
  return {
    platform: 'discord',
    guildId: process.env.DEMO_DISCORD_GUILD_ID || '1504701050899271741',
    channelId: process.env.DEMO_DISCORD_CHANNEL_ID || '1504701289827930153',
    memberCount: Number(process.env.COMMUNITY_MEMBER_COUNT ?? 847),
    priceFloorUsdc: Number(process.env.COMMUNITY_PRICE_FLOOR_USDC ?? 25),
    minSponsorScore: Number(process.env.COMMUNITY_MIN_SPONSOR_SCORE ?? 70),
    contentRules: splitRules(process.env.COMMUNITY_CONTENT_RULES ?? 'no gambling; no scams; no adult content; no guaranteed returns'),
    maxAdsPerDay: Number(process.env.COMMUNITY_MAX_ADS_PER_DAY ?? 3),
  };
}

export async function loadConfiguredMandates(): Promise<ConfiguredMandates> {
  const [sponsorSnapshot, communitySnapshot] = await Promise.all([
    readJson<SavedMandate<Partial<SponsorMandate>>>(sponsorFile, null),
    readJson<SavedMandate<Partial<CommunityMandate>>>(communityFile, null),
  ]);
  const sponsorMandate = sanitizeSponsorMandate(sponsorSnapshot?.mandate);
  const communityMandate = sanitizeCommunityMandate(communitySnapshot?.mandate);
  return {
    sponsorMandate,
    communityMandate,
    sponsorSnapshot: sponsorSnapshot ? { ...sponsorSnapshot, mandate: sponsorMandate } : null,
    communitySnapshot: communitySnapshot ? { ...communitySnapshot, mandate: communityMandate } : null,
  };
}

export async function saveConfiguredMandates(input: {
  sponsor?: Partial<SponsorMandate>;
  community?: Partial<CommunityMandate> & { contentRulesText?: string };
  sponsorWallet?: string;
  communityWallet?: string;
}) {
  const current = await loadConfiguredMandates();
  const sponsorMandate = sanitizeSponsorMandate({ ...current.sponsorMandate, ...input.sponsor });
  const communityInput = {
    ...current.communityMandate,
    ...input.community,
    contentRules: input.community?.contentRulesText ? splitRules(input.community.contentRulesText) : input.community?.contentRules,
  };
  const communityMandate = sanitizeCommunityMandate(communityInput);
  const now = Date.now();
  const sponsorSnapshot: SavedMandate<SponsorMandate> = {
    role: 'sponsor',
    wallet: input.sponsorWallet || process.env.SPONSOR_WALLET_ADDRESS || 'local-sponsor-wallet',
    agentId: process.env.SPONSOR_ERC8004_AGENT_ID,
    mandate: sponsorMandate,
    updatedAt: now,
  };
  const communitySnapshot: SavedMandate<CommunityMandate> = {
    role: 'community',
    wallet: input.communityWallet || process.env.COMMUNITY_WALLET_ADDRESS || 'local-community-wallet',
    agentId: process.env.COMMUNITY_ERC8004_AGENT_ID,
    mandate: communityMandate,
    updatedAt: now,
  };

  await fs.mkdir(CACHE_DIR, { recursive: true });
  await Promise.all([
    fs.writeFile(sponsorFile, JSON.stringify(sponsorSnapshot, null, 2), 'utf-8'),
    fs.writeFile(communityFile, JSON.stringify(communitySnapshot, null, 2), 'utf-8'),
  ]);

  return { sponsor: sponsorSnapshot, community: communitySnapshot };
}

function sanitizeSponsorMandate(input: Partial<SponsorMandate> | null | undefined): SponsorMandate {
  const fallback = defaultSponsorMandate();
  return {
    budgetUsdc: positiveNumber(input?.budgetUsdc, fallback.budgetUsdc),
    maxPricePerPostUsdc: positiveNumber(input?.maxPricePerPostUsdc, fallback.maxPricePerPostUsdc),
    minMemberCount: positiveNumber(input?.minMemberCount, fallback.minMemberCount),
    minReputationScore: boundedNumber(input?.minReputationScore, fallback.minReputationScore, 0, 100),
    contentPolicy: cleanText(input?.contentPolicy, fallback.contentPolicy),
    adCopy: cleanText(input?.adCopy, fallback.adCopy),
    campaignName: cleanText(input?.campaignName, fallback.campaignName),
  };
}

function sanitizeCommunityMandate(input: Partial<CommunityMandate> | null | undefined): CommunityMandate {
  const fallback = defaultCommunityMandate();
  return {
    platform: input?.platform === 'telegram' ? 'telegram' : 'discord',
    guildId: cleanText(input?.guildId, fallback.guildId),
    channelId: cleanText(input?.channelId, fallback.channelId),
    memberCount: positiveNumber(input?.memberCount, fallback.memberCount),
    priceFloorUsdc: positiveNumber(input?.priceFloorUsdc, fallback.priceFloorUsdc),
    minSponsorScore: boundedNumber(input?.minSponsorScore, fallback.minSponsorScore, 0, 100),
    contentRules: Array.isArray(input?.contentRules) && input.contentRules.length ? input.contentRules.map(String).map((rule) => rule.trim()).filter(Boolean) : fallback.contentRules,
    maxAdsPerDay: positiveNumber(input?.maxAdsPerDay, fallback.maxAdsPerDay),
  };
}

function splitRules(value: string) {
  return value
    .split(/[;\n,]/)
    .map((rule) => rule.trim())
    .filter(Boolean);
}

function positiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function cleanText(value: unknown, fallback: string) {
  const text = String(value ?? '').trim();
  return text || fallback;
}

async function readJson<T>(filePath: string, fallback: T | null): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}
