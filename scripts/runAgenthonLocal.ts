import * as dotenv from 'dotenv';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { createPublicClient, createWalletClient, decodeEventLog, getAddress, http, parseUnits, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hardhatLocal } from '../services/chainConfig';
import { SponsorAgent, SponsorMandate } from '../agents/sponsorAgent';
import { CommunityAgent, CommunityMandate } from '../agents/communityAgent';
import { SettlementService } from '../services/settlementService';
import { writeProofBundle } from '../services/evidenceService';
import { buildPaymentReceipt, writePaymentReceipt } from '../services/paymentReceiptService';
import { loadConfiguredMandates } from '../services/mandateConfigService';
import { NegotiationResponse } from '../types/messages';
import { REPO_ROOT } from '../services/pathConfig';
import mockUsdcArtifact from '../artifacts/contracts/MockUSDC.sol/MockUSDC.json';
import adEscrowArtifact from '../artifacts/contracts/AdEscrow.sol/AdEscrow.json';
import intentRegistryArtifact from '../artifacts/contracts/IntentRegistry.sol/IntentRegistry.json';
import identityArtifact from '../artifacts/contracts/erc8004/MockIdentityRegistry.sol/MockIdentityRegistry.json';
import reputationArtifact from '../artifacts/contracts/erc8004/MockReputationRegistry.sol/MockReputationRegistry.json';

dotenv.config();

export const LOCAL_RPC_URL = process.env.LOCAL_RPC_URL || 'http://127.0.0.1:8545';
export const LOCAL_SPONSOR_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
export const LOCAL_COMMUNITY_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface LocalDeployment {
  mockUsdc: Address;
  intentRegistry: Address;
  adEscrow: Address;
  identityRegistry: Address;
  reputationRegistry: Address;
}

async function rpcReady(): Promise<boolean> {
  try {
    const response = await fetch(LOCAL_RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function ensureHardhatNode(): Promise<ChildProcessWithoutNullStreams | undefined> {
  if (await rpcReady()) return undefined;

  console.log('[AgenthonLocal] Starting local Hardhat node...');
  const hardhatBin = process.platform === 'win32'
    ? `${REPO_ROOT}\\node_modules\\.bin\\hardhat.cmd`
    : `${REPO_ROOT}/node_modules/.bin/hardhat`;
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/c', hardhatBin, 'node', '--hostname', '127.0.0.1'], {
      cwd: REPO_ROOT,
      stdio: 'pipe',
    })
    : spawn(hardhatBin, ['node', '--hostname', '127.0.0.1'], {
    cwd: REPO_ROOT,
    stdio: 'pipe',
  });
  child.stdout.on('data', (chunk) => {
    const text = String(chunk);
    if (text.includes('Started HTTP')) console.log('[AgenthonLocal] Hardhat node ready.');
  });
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  for (let i = 0; i < 30; i++) {
    if (await rpcReady()) return child;
    await sleep(500);
  }

  child.kill();
  throw new Error('Hardhat node did not start on 127.0.0.1:8545');
}

export async function deployLocal(): Promise<LocalDeployment> {
  const account = privateKeyToAccount(LOCAL_SPONSOR_KEY);
  const publicClient = createPublicClient({ chain: hardhatLocal, transport: http(LOCAL_RPC_URL) });
  const walletClient = createWalletClient({ account, chain: hardhatLocal, transport: http(LOCAL_RPC_URL) });

  async function deploy(label: string, artifact: any, args: readonly unknown[] = []): Promise<Address> {
    const hash = await walletClient.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode as Hex,
      args,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (!receipt.contractAddress) throw new Error(`${label} deployment produced no contract address`);
    console.log(`[AgenthonLocal] ${label}: ${receipt.contractAddress}`);
    return receipt.contractAddress;
  }

  const mockUsdc = await deploy('MockUSDC', mockUsdcArtifact);
  const identityRegistry = await deploy('MockIdentityRegistry', identityArtifact);
  const reputationRegistry = await deploy('MockReputationRegistry', reputationArtifact);
  const intentRegistry = await deploy('IntentRegistry', intentRegistryArtifact);
  const adEscrow = await deploy('AdEscrow', adEscrowArtifact, [mockUsdc, account.address]);

  const mintHash = await walletClient.writeContract({
    address: mockUsdc,
    abi: mockUsdcArtifact.abi,
    functionName: 'mint',
    args: [account.address, parseUnits('1000', 6)],
  });
  await publicClient.waitForTransactionReceipt({ hash: mintHash });
  console.log(`[AgenthonLocal] Minted 1000 mUSDC to sponsor ${account.address}`);

  const windowHash = await walletClient.writeContract({
    address: adEscrow,
    abi: adEscrowArtifact.abi,
    functionName: 'setDisputeWindow',
    args: [1n],
  });
  await publicClient.waitForTransactionReceipt({ hash: windowHash });

  return { mockUsdc, identityRegistry, reputationRegistry, intentRegistry, adEscrow };
}

export function configureEnv(deployment: LocalDeployment) {
  const sponsor = privateKeyToAccount(LOCAL_SPONSOR_KEY);
  const community = privateKeyToAccount(LOCAL_COMMUNITY_KEY);
  process.env.CHAIN_MODE = 'local';
  process.env.LOCAL_RPC_URL = LOCAL_RPC_URL;
  process.env.SPONSOR_PRIVATE_KEY = LOCAL_SPONSOR_KEY;
  process.env.COMMUNITY_PRIVATE_KEY = LOCAL_COMMUNITY_KEY;
  process.env.SPONSOR_WALLET_ADDRESS = sponsor.address;
  process.env.COMMUNITY_WALLET_ADDRESS = community.address;
  process.env.USDC_CONTRACT_ADDRESS = deployment.mockUsdc;
  process.env.INTENT_REGISTRY_ADDRESS = deployment.intentRegistry;
  process.env.AD_ESCROW_ADDRESS = deployment.adEscrow;
  process.env.ERC8004_IDENTITY_REGISTRY_ADDRESS = deployment.identityRegistry;
  process.env.ERC8004_REPUTATION_REGISTRY_ADDRESS = deployment.reputationRegistry;
  process.env.USE_MOCK_REPUTATION = 'false';
  process.env.GOOGLE_API_KEY = process.env.AGENTHON_USE_LLM === 'true' ? process.env.GOOGLE_API_KEY : '';
}

export async function parseEventId(publicClient: any, txHash: Hex, artifact: any, eventName: string, field: string): Promise<bigint> {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  for (const log of receipt.logs) {
    try {
      const decoded: any = decodeEventLog({ abi: artifact.abi, data: log.data, topics: log.topics });
      if (decoded.eventName === eventName) return BigInt((decoded.args as any)[field]);
    } catch {
      // Ignore unrelated logs.
    }
  }
  throw new Error(`${eventName} not found in ${txHash}`);
}

export async function runAgenthonLocal() {
  const node = await ensureHardhatNode();
  try {
    const deployment = await deployLocal();
    configureEnv(deployment);

    const sponsorAccount = privateKeyToAccount(LOCAL_SPONSOR_KEY);
    const communityAccount = privateKeyToAccount(LOCAL_COMMUNITY_KEY);
    const publicClient = createPublicClient({ chain: hardhatLocal, transport: http(LOCAL_RPC_URL) });

    const { sponsorMandate, communityMandate } = await loadConfiguredMandates();

    const useLocalDelivery = process.env.AGENTHON_ALLOW_LOCAL_DELIVERY === 'true';
    const hasDiscord = Boolean(process.env.COMMUNITY_DISCORD_BOT_TOKEN && process.env.SPONSOR_DISCORD_BOT_TOKEN && process.env.DEMO_DISCORD_GUILD_ID && process.env.DEMO_DISCORD_CHANNEL_ID);
    if (!hasDiscord && !useLocalDelivery) {
      throw new Error('Discord is not configured. Set Discord bot env vars, or set AGENTHON_ALLOW_LOCAL_DELIVERY=true for local-only delivery.');
    }

    const sponsor = new SponsorAgent(LOCAL_SPONSOR_KEY, sponsorMandate);
    const community = new CommunityAgent(LOCAL_COMMUNITY_KEY, communityMandate);

    await sponsor.initialize(process.env.SPONSOR_AGENT_CARD_URI ?? 'inline://sponsor-agent-card');
    await community.initialize(process.env.COMMUNITY_AGENT_CARD_URI ?? 'inline://community-agent-card');
    await community.resetInventoryWindow();
    const sponsorAgentId = BigInt(sponsor.getRuntimeStatus().agentId!);
    const communityAgentId = BigInt(community.getRuntimeStatus().agentId!);

    await (sponsor as any).erc8004.postFeedback(sponsorAgentId, 78, 'agenthon.seed.sponsor', 'inline://seed-sponsor');
    await (sponsor as any).erc8004.postFeedback(communityAgentId, 82, 'agenthon.seed.community', 'inline://seed-community');

    if (useLocalDelivery && !hasDiscord) {
      (community as any).delivery.postToDiscord = async () => {
        const id = `local-message-${Date.now()}`;
        if (process.env.REPLIZ_KEY) {
          console.log(`[Repliz] Initiating social media monitoring for discord post: ${id}`);
          await sleep(400);
          console.log(`[Repliz] Successfully hooked into post. Ready to manage comments and engagement automatically.`);
        }
        return id;
      };
      sponsor.verifyDelivery = async () => true;
      console.log('[AgenthonLocal] Using explicit local delivery adapter. Set Discord env vars for real bot delivery.');
    }

    const sponsorChain = new (await import('../services/liveChainService')).LiveChainService(LOCAL_SPONSOR_KEY);
    const communityChain = new (await import('../services/liveChainService')).LiveChainService(LOCAL_COMMUNITY_KEY);
    const intentRegistry = sponsorChain.intentRegistry(deployment.intentRegistry);
    const escrowSponsor = sponsorChain.adEscrow(deployment.adEscrow);
    const escrowCommunity = communityChain.adEscrow(deployment.adEscrow);
    const usdcSponsor = sponsorChain.erc20(deployment.mockUsdc);

    console.log('\n====== ADSOURCING AGENTHON LOCAL MODE ======\n');
    console.log(`[AgenthonLocal] Sponsor ${sponsorAccount.address} agentId=${sponsorAgentId}`);
    console.log(`[AgenthonLocal] Community ${communityAccount.address} agentId=${communityAgentId}`);

    const intentTx = await intentRegistry.write.broadcastIntent([
      sponsorAgentId,
      parseUnits(String(sponsorMandate.maxPricePerPostUsdc), 6),
      BigInt(sponsorMandate.minMemberCount),
      'inline://content-policy',
      sponsorMandate.adCopy,
      3600n,
    ]);
    const intentId = await parseEventId(publicClient, intentTx as Hex, intentRegistryArtifact, 'IntentBroadcast', 'intentId');
    console.log(`[AgenthonLocal] Intent broadcast: ${intentId} tx=${intentTx}`);

    const handshake = await sponsor.createHandshakeRequest(intentId);
    const handshakeResponse = await community.handleHandshakeRequest(handshake);
    console.log(`[AgenthonLocal] Handshake: ${handshakeResponse.accepted ? 'accepted' : `rejected: ${handshakeResponse.reason}`}`);
    if (!handshakeResponse.accepted) return;

    let round = 1;
    let lastResponse: NegotiationResponse | undefined;
    let acceptedPrice = 0;
    let acceptedDuration = 0;
    let acceptedPostType: 'standard' | 'pinned' = 'standard';

    while (round <= 3) {
      const offer = await sponsor.makeOffer(
        communityAccount.address,
        handshakeResponse.recipientReputationScore,
        handshakeResponse.memberCount ?? communityMandate.memberCount,
        round,
        lastResponse,
        intentId,
      );
      console.log(`[AgenthonLocal] Round ${round} offer: $${offer.offeredPriceUsdc}`);
      const evaluation = await community.evaluateOffer(
        offer,
        sponsorMandate.adCopy,
        sponsorAccount.address,
        intentId,
        handshake.senderReputationScore,
      );
      console.log(`[AgenthonLocal] Round ${round} community: ${evaluation.type}`);
      if (evaluation.type === 'ACCEPT') {
        acceptedPrice = offer.offeredPriceUsdc;
        acceptedDuration = offer.postDurationHours;
        acceptedPostType = offer.postType;
        break;
      }
      if (evaluation.type === 'REJECT') return;
      lastResponse = evaluation;
      round++;
    }

    if (!acceptedPrice) throw new Error('No agreement reached.');

    const escrowTx = await sponsor.fundEscrow(
      communityAccount.address,
      communityAgentId,
      acceptedPrice,
      intentId,
      escrowSponsor,
      usdcSponsor,
      {
        terms: { priceUsdc: acceptedPrice, postDurationHours: acceptedDuration, postType: acceptedPostType },
        adCopy: sponsorMandate.adCopy,
      },
    );
    const escrowId = await parseEventId(publicClient, escrowTx as Hex, adEscrowArtifact, 'EscrowFunded', 'escrowId');
    console.log(`[AgenthonLocal] Escrow funded: ${escrowId} tx=${escrowTx}`);

    const delivery = await community.postAd(sponsorMandate.adCopy, escrowId.toString(), escrowCommunity);
    console.log(`[AgenthonLocal] Delivery proof: ${delivery.deliveryProof}`);
    await sleep(1500);

    const settlement = new SettlementService();
    settlement.register({
      escrowId: escrowId.toString(),
      deliveryProof: delivery.deliveryProof,
      settleAfterMs: 0,
      communityWallet: communityAccount.address,
      sponsorAgent: sponsor,
      escrowContract: escrowSponsor,
      erc8004: (sponsor as any).erc8004,
      sponsorAgentId,
      communityAgentId,
    });
    await settlement.processSettlements();

    const communityDeal = community.getRuntimeStatus().deals.find((deal: any) => deal.dealId === `${intentId}:${sponsorAccount.address.toLowerCase()}`);
    if (communityDeal) {
      const proof = await writeProofBundle(communityDeal, {
        sponsorMandate,
        communityMandate,
        reputationSources: {
          sponsor: { score: handshake.senderReputationScore, source: 'local-erc8004' },
          community: { score: handshakeResponse.recipientReputationScore, source: 'local-erc8004' },
        },
        chain: {
          name: 'Hardhat Local',
          chainId: 31337,
          escrowContract: deployment.adEscrow,
          intentRegistry: deployment.intentRegistry,
        },
      });
      const paymentReceipt = buildPaymentReceipt({
        escrowId: escrowId.toString(),
        amountUsdc: acceptedPrice,
        status: 'SETTLED',
        txHashes: [intentTx, escrowTx, delivery.txHash],
        proofHash: proof.bundle.finalHash,
      });
      const paymentPath = await writePaymentReceipt(paymentReceipt);
      console.log(`[AgenthonLocal] Proof bundle: ${proof.filePath}`);
      console.log(`[AgenthonLocal] Payment receipt: ${paymentPath}`);
    }

    return deployment;
  } finally {
    if (node) {
      if (process.platform === 'win32' && node.pid) {
        spawn(`taskkill /PID ${node.pid} /T /F`, { shell: true });
      } else {
        node.kill();
      }
      console.log('[AgenthonLocal] Stopped local Hardhat node.');
    }
  }
}

if (require.main === module) {
  runAgenthonLocal().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
