import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { createPublicClient, http, parseUnits, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { SponsorAgent, type SponsorMandate } from '../agents/sponsorAgent';
import { CommunityAgent, type CommunityMandate } from '../agents/communityAgent';
import { hardhatLocal } from './chainConfig';
import { LiveChainService } from './liveChainService';
import { SettlementService } from './settlementService';
import { writeProofBundle } from './evidenceService';
import { buildPaymentReceipt, writePaymentReceipt } from './paymentReceiptService';
import { loadConfiguredMandates } from './mandateConfigService';
import type { HandshakeRequest, HandshakeResponse, NegotiationOffer, NegotiationResponse, DeliveryNotification } from '../types/messages';
import adEscrowArtifact from '../artifacts/contracts/AdEscrow.sol/AdEscrow.json';
import intentRegistryArtifact from '../artifacts/contracts/IntentRegistry.sol/IntentRegistry.json';
import {
  configureEnv,
  deployLocal,
  ensureHardhatNode,
  LOCAL_COMMUNITY_KEY,
  LOCAL_RPC_URL,
  LOCAL_SPONSOR_KEY,
  parseEventId,
  type LocalDeployment,
} from '../scripts/runAgenthonLocal';
import { cachePath } from './pathConfig';

type TheaterActor = 'sponsor' | 'community' | 'system';

interface TheaterEvent {
  actor: TheaterActor;
  title: string;
  detail: string;
  createdAt: number;
  payload?: unknown;
}

interface TheaterRuntime {
  node?: ChildProcessWithoutNullStreams;
  deployment: LocalDeployment;
  sponsor: SponsorAgent;
  community: CommunityAgent;
  sponsorAccount: ReturnType<typeof privateKeyToAccount>;
  communityAccount: ReturnType<typeof privateKeyToAccount>;
  publicClient: ReturnType<typeof createPublicClient>;
  intentRegistry: any;
  escrowSponsor: any;
  escrowCommunity: any;
  usdcSponsor: any;
  sponsorMandate: SponsorMandate;
  communityMandate: CommunityMandate;
  sponsorAgentId: bigint;
  communityAgentId: bigint;
  allowLocalDelivery: boolean;
  intentTx?: Hex;
  intentId?: bigint;
  handshake?: HandshakeRequest;
  handshakeResponse?: HandshakeResponse;
  offer?: NegotiationOffer;
  response?: NegotiationResponse;
  acceptedPrice?: number;
  acceptedDuration?: number;
  acceptedPostType?: 'standard' | 'pinned';
  escrowTx?: Hex;
  escrowId?: bigint;
  delivery?: DeliveryNotification;
  proofId?: string;
  proofHash?: string;
  receiptId?: string;
  paymentPath?: string;
  settled?: boolean;
  events: TheaterEvent[];
}

export class AgentTheaterService {
  private runtime: TheaterRuntime | null = null;
  private readonly stateFile = cachePath('two-agent-theater-state.json');

  async reset(options: { allowLocalDelivery?: boolean } = {}) {
    await this.dispose();
    const allowLocalDelivery = options.allowLocalDelivery ?? true;
    const node = await ensureHardhatNode();
    const deployment = await deployLocal();
    configureEnv(deployment);

    const sponsorAccount = privateKeyToAccount(LOCAL_SPONSOR_KEY);
    const communityAccount = privateKeyToAccount(LOCAL_COMMUNITY_KEY);
    const publicClient = createPublicClient({ chain: hardhatLocal, transport: http(LOCAL_RPC_URL) });

    const { sponsorMandate, communityMandate } = await loadConfiguredMandates();

    const hasDiscord = Boolean(process.env.COMMUNITY_DISCORD_BOT_TOKEN && process.env.SPONSOR_DISCORD_BOT_TOKEN && process.env.DEMO_DISCORD_GUILD_ID && process.env.DEMO_DISCORD_CHANNEL_ID);
    if (!hasDiscord && !allowLocalDelivery) {
      throw new Error('Discord is not configured. Set Discord bot env vars, or run the theater with local delivery.');
    }

    const sponsor = new SponsorAgent(LOCAL_SPONSOR_KEY, sponsorMandate);
    const community = new CommunityAgent(LOCAL_COMMUNITY_KEY, communityMandate);
    await sponsor.initialize(process.env.SPONSOR_AGENT_CARD_URI ?? 'inline://sponsor-agent-card');
    await community.initialize(process.env.COMMUNITY_AGENT_CARD_URI ?? 'inline://community-agent-card');
    await community.resetInventoryWindow();

    const sponsorAgentId = BigInt(sponsor.getRuntimeStatus().agentId!);
    const communityAgentId = BigInt(community.getRuntimeStatus().agentId!);
    await (sponsor as any).erc8004.postFeedback(sponsorAgentId, 78, 'theater.seed.sponsor', 'inline://seed-sponsor');
    await (sponsor as any).erc8004.postFeedback(communityAgentId, 82, 'theater.seed.community', 'inline://seed-community');

    if (allowLocalDelivery && !hasDiscord) {
      (community as any).delivery.postToDiscord = async () => `local-message-${Date.now()}`;
      sponsor.verifyDelivery = async () => true;
    }

    const sponsorChain = new LiveChainService(LOCAL_SPONSOR_KEY);
    const communityChain = new LiveChainService(LOCAL_COMMUNITY_KEY);

    this.runtime = {
      node,
      deployment,
      sponsor,
      community,
      sponsorAccount,
      communityAccount,
      publicClient,
      intentRegistry: sponsorChain.intentRegistry(deployment.intentRegistry),
      escrowSponsor: sponsorChain.adEscrow(deployment.adEscrow),
      escrowCommunity: communityChain.adEscrow(deployment.adEscrow),
      usdcSponsor: sponsorChain.erc20(deployment.mockUsdc),
      sponsorMandate,
      communityMandate,
      sponsorAgentId,
      communityAgentId,
      allowLocalDelivery,
      events: [],
    };

    this.event('system', 'Theater initialized', 'Local chain, contracts, two wallets, two agents, and reputation seed scores are ready.');
    await this.writeState();
    return this.status();
  }

  async sponsorBroadcast() {
    const runtime = this.requireRuntime();
    runtime.intentTx = await runtime.intentRegistry.write.broadcastIntent([
      runtime.sponsorAgentId,
      parseUnits(String(runtime.sponsorMandate.maxPricePerPostUsdc), 6),
      BigInt(runtime.sponsorMandate.minMemberCount),
      'inline://content-policy',
      runtime.sponsorMandate.adCopy,
      3600n,
    ]) as Hex;
    runtime.intentId = await parseEventId(runtime.publicClient, runtime.intentTx, intentRegistryArtifact, 'IntentBroadcast', 'intentId');
    this.event('sponsor', 'Intent broadcast', `Sponsor Agent published campaign intent ${runtime.intentId} with max $${runtime.sponsorMandate.maxPricePerPostUsdc}.`, {
      txHash: runtime.intentTx,
      intentId: runtime.intentId.toString(),
    });
    await this.writeState();
    return this.status();
  }

  async communityHandshake() {
    const runtime = this.requireRuntime(['intentId']);
    runtime.handshake = await runtime.sponsor.createHandshakeRequest(runtime.intentId!);
    runtime.handshakeResponse = await runtime.community.handleHandshakeRequest(runtime.handshake);
    this.event(
      'community',
      runtime.handshakeResponse.accepted ? 'Handshake accepted' : 'Handshake rejected',
      runtime.handshakeResponse.accepted
        ? `Community Agent verified sponsor wallet, signature, score ${runtime.handshake.senderReputationScore}, and inventory.`
        : runtime.handshakeResponse.reason ?? 'Handshake rejected.',
      { accepted: runtime.handshakeResponse.accepted },
    );
    await this.writeState();
    return this.status();
  }

  async sponsorOffer() {
    const runtime = this.requireRuntime(['intentId', 'handshakeResponse']);
    if (!runtime.handshakeResponse?.accepted) throw new Error('Community handshake is not accepted.');
    runtime.offer = await runtime.sponsor.makeOffer(
      runtime.communityAccount.address,
      runtime.handshakeResponse.recipientReputationScore,
      runtime.handshakeResponse.memberCount ?? runtime.communityMandate.memberCount,
      1,
      undefined,
      runtime.intentId!,
    );
    this.event('sponsor', 'Offer sent', `Sponsor Agent offered $${runtime.offer.offeredPriceUsdc} for a ${runtime.offer.postDurationHours}h ${runtime.offer.postType} post.`, {
      offer: runtime.offer,
    });
    await this.writeState();
    return this.status();
  }

  async communityDecide() {
    const runtime = this.requireRuntime(['intentId', 'offer', 'handshake']);
    runtime.response = await runtime.community.evaluateOffer(
      runtime.offer!,
      runtime.sponsorMandate.adCopy,
      runtime.sponsorAccount.address,
      runtime.intentId!,
      runtime.handshake!.senderReputationScore,
    );
    if (runtime.response.type === 'ACCEPT') {
      runtime.acceptedPrice = runtime.offer!.offeredPriceUsdc;
      runtime.acceptedDuration = runtime.offer!.postDurationHours;
      runtime.acceptedPostType = runtime.offer!.postType;
    }
    this.event('community', `Offer ${runtime.response.type.toLowerCase()}`, `Community Agent decision: ${runtime.response.type}. ${runtime.response.reason}`, {
      response: runtime.response,
    });
    await this.writeState();
    return this.status();
  }

  async sponsorFund() {
    const runtime = this.requireRuntime(['intentId', 'response']);
    if (runtime.response?.type !== 'ACCEPT' || !runtime.acceptedPrice) throw new Error('No accepted offer to fund.');
    runtime.escrowTx = await runtime.sponsor.fundEscrow(
      runtime.communityAccount.address,
      runtime.communityAgentId,
      runtime.acceptedPrice,
      runtime.intentId!,
      runtime.escrowSponsor,
      runtime.usdcSponsor,
      {
        terms: {
          priceUsdc: runtime.acceptedPrice,
          postDurationHours: runtime.acceptedDuration ?? runtime.offer!.postDurationHours,
          postType: runtime.acceptedPostType ?? runtime.offer!.postType,
        },
        adCopy: runtime.sponsorMandate.adCopy,
      },
    ) as Hex;
    runtime.escrowId = await parseEventId(runtime.publicClient, runtime.escrowTx, adEscrowArtifact, 'EscrowFunded', 'escrowId');
    this.event('sponsor', 'Escrow funded', `Sponsor Agent locked $${runtime.acceptedPrice} USDC into escrow ${runtime.escrowId}.`, {
      txHash: runtime.escrowTx,
      escrowId: runtime.escrowId.toString(),
    });
    await this.writeState();
    return this.status();
  }

  async communityDeliver() {
    const runtime = this.requireRuntime(['escrowId']);
    runtime.delivery = await runtime.community.postAd(runtime.sponsorMandate.adCopy, runtime.escrowId!.toString(), runtime.escrowCommunity);
    this.event('community', 'Ad delivered', `Community Agent posted the ad and logged proof ${runtime.delivery.deliveryProof}.`, {
      delivery: runtime.delivery,
    });
    await this.writeState();
    return this.status();
  }

  async sponsorSettle() {
    const runtime = this.requireRuntime(['escrowId', 'delivery']);
    const settlement = new SettlementService();
    settlement.register({
      escrowId: runtime.escrowId!.toString(),
      deliveryProof: runtime.delivery!.deliveryProof,
      settleAfterMs: 0,
      communityWallet: runtime.communityAccount.address,
      sponsorAgent: runtime.sponsor,
      escrowContract: runtime.escrowSponsor,
      erc8004: (runtime.sponsor as any).erc8004,
      sponsorAgentId: runtime.sponsorAgentId,
      communityAgentId: runtime.communityAgentId,
    });
    await settlement.processSettlements();
    runtime.settled = true;

    const communityDeal = runtime.community.getRuntimeStatus().deals.find((deal: any) => deal.dealId === `${runtime.intentId}:${runtime.sponsorAccount.address.toLowerCase()}`);
    if (communityDeal) {
      const proof = await writeProofBundle(communityDeal, {
        sponsorMandate: runtime.sponsorMandate,
        communityMandate: runtime.communityMandate,
        reputationSources: {
          sponsor: { score: runtime.handshake?.senderReputationScore ?? 78, source: 'local-erc8004' },
          community: { score: runtime.handshakeResponse?.recipientReputationScore ?? 82, source: 'local-erc8004' },
        },
        chain: {
          name: 'Hardhat Local',
          chainId: 31337,
          escrowContract: runtime.deployment.adEscrow,
          intentRegistry: runtime.deployment.intentRegistry,
        },
      });
      const paymentReceipt = buildPaymentReceipt({
        escrowId: runtime.escrowId!.toString(),
        amountUsdc: runtime.acceptedPrice!,
        status: 'SETTLED',
        txHashes: [runtime.intentTx!, runtime.escrowTx!, runtime.delivery!.txHash],
        proofHash: proof.bundle.finalHash,
      });
      runtime.paymentPath = await writePaymentReceipt(paymentReceipt);
      runtime.proofId = proof.bundle.proofId;
      runtime.proofHash = proof.bundle.finalHash;
      runtime.receiptId = paymentReceipt.receiptId;
    }

    this.event('sponsor', 'Settlement verified', `Sponsor Agent verified delivery and settlement closed. Receipt ${runtime.receiptId ?? 'written'}.`, {
      proofId: runtime.proofId,
      receiptId: runtime.receiptId,
    });
    await this.writeState();
    return this.status();
  }

  async status() {
    if (!this.runtime) {
      try {
        const text = await fs.readFile(this.stateFile, 'utf-8');
        return JSON.parse(text);
      } catch {
        return { status: 'idle', events: [] };
      }
    }
    return this.snapshot();
  }

  async dispose() {
    if (process.env.AGENTHON_STOP_LOCAL_NODE === 'true' && this.runtime?.node) {
      if (process.platform === 'win32' && this.runtime.node.pid) {
        spawn(`taskkill /PID ${this.runtime.node.pid} /T /F`, { shell: true });
      } else {
        this.runtime.node.kill();
      }
    }
    this.runtime = null;
  }

  private requireRuntime(keys: Array<keyof TheaterRuntime> = []): TheaterRuntime {
    if (!this.runtime) throw new Error('Two-agent theater is not initialized. Run adsourcing_theater_reset first.');
    for (const key of keys) {
      if (this.runtime[key] === undefined || this.runtime[key] === null) {
        throw new Error(`Two-agent theater missing state: ${String(key)}.`);
      }
    }
    return this.runtime;
  }

  private event(actor: TheaterActor, title: string, detail: string, payload?: unknown) {
    if (!this.runtime) return;
    this.runtime.events.push({ actor, title, detail, payload, createdAt: Date.now() });
  }

  private snapshot() {
    const runtime = this.requireRuntime();
    const hasIntent = runtime.intentId !== undefined && runtime.intentId !== null;
    const hasEscrow = runtime.escrowId !== undefined && runtime.escrowId !== null;

    return {
      status: runtime.settled ? 'settled' : hasEscrow ? 'funded' : runtime.response ? 'agreed' : runtime.offer ? 'negotiating' : runtime.handshakeResponse ? 'handshake' : hasIntent ? 'discovered' : 'ready',
      mode: runtime.allowLocalDelivery ? 'local-delivery' : 'discord-delivery',
      sponsor: {
        wallet: runtime.sponsorAccount.address,
        agentId: runtime.sponsorAgentId.toString(),
        maxPriceUsdc: runtime.sponsorMandate.maxPricePerPostUsdc,
      },
      community: {
        wallet: runtime.communityAccount.address,
        agentId: runtime.communityAgentId.toString(),
        floorUsdc: runtime.communityMandate.priceFloorUsdc,
        platform: runtime.communityMandate.platform,
        guildId: runtime.communityMandate.guildId,
        channelId: runtime.communityMandate.channelId,
      },
      intent: hasIntent ? {
        id: runtime.intentId!.toString(),
        txHash: runtime.intentTx,
      } : null,
      handshake: runtime.handshakeResponse ? {
        accepted: runtime.handshakeResponse.accepted,
        sponsorScore: runtime.handshake?.senderReputationScore,
        communityScore: runtime.handshakeResponse.recipientReputationScore,
      } : null,
      offer: runtime.offer ?? null,
      response: runtime.response ?? null,
      escrow: hasEscrow ? {
        id: runtime.escrowId!.toString(),
        amountUsdc: runtime.acceptedPrice,
        txHash: runtime.escrowTx,
        settled: Boolean(runtime.settled),
      } : null,
      delivery: runtime.delivery ?? null,
      proof: {
        proofId: runtime.proofId,
        proofHash: runtime.proofHash,
        receiptId: runtime.receiptId,
        paymentPath: runtime.paymentPath,
      },
      events: runtime.events,
      updatedAt: Date.now(),
    };
  }

  private async writeState() {
    await fs.mkdir(path.dirname(this.stateFile), { recursive: true });
    await fs.writeFile(this.stateFile, JSON.stringify(this.snapshot(), bigintReplacer, 2), 'utf-8');
  }
}

function bigintReplacer(_key: string, value: unknown) {
  return typeof value === 'bigint' ? value.toString() : value;
}
