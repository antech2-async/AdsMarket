# AdMarket — Technical Specification
### Autonomous Micro-Sponsorship Protocol
**OpenClaw × ERC-8004 Hackathon — Jakarta, May 15-16, 2026**

---

## 0. Read This First

This document is the single source of truth for the build. If you open it mid-sprint and forget the plot, read Section 1 and Section 3. Everything else is reference.

### What You're Building in One Sentence

Two AI agents — one representing a brand, one representing a community — that autonomously discover each other, negotiate a sponsorship deal in structured messages, escrow funds on-chain, deliver an ad post to Discord/Telegram, and settle payment, with no human in the loop after initial setup.

### The Three Things to Never Forget

1. **The agents are the product. The contracts are the rails.** Judges need to see agents doing things, not smart contract diagrams.
2. **On-Chain Reputation is built as a swappable module from day one.** If the testnet RPC is down on hackathon day, you flip a boolean to use the mock and keep moving.
3. **The demo loop is 90 seconds.** Every architectural decision should serve that loop.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [The Demo Loop](#3-the-demo-loop)
4. [ERC-8004 Integration — Real Contracts](#4-erc-8004-integration--real-contracts)
5. [Reputation Layer — ReputationService](#5-reputation-layer--reputationservice)
6. [Smart Contracts](#6-smart-contracts)
7. [Agent Communication Protocol](#7-agent-communication-protocol)
8. [Sponsor Agent Implementation](#8-sponsor-agent-implementation)
9. [Community Agent Implementation](#9-community-agent-implementation)
10. [Discord/Telegram Delivery Layer](#10-discordtelegram-delivery-layer)
11. [Optimistic Settlement](#11-optimistic-settlement)
12. [Spam Defense Architecture](#12-spam-defense-architecture)
13. [Project Structure](#13-project-structure)
14. [Dependencies](#14-dependencies)
15. [Environment Variables](#15-environment-variables)
16. [Deployment Sequence](#16-deployment-sequence)
17. [Demo Script](#17-demo-script)
18. [Judge Q&A — Anticipated Questions](#18-judge-qa--anticipated-questions)
19. [Known Limitations and Honest Answers](#19-known-limitations-and-honest-answers)
20. [Development Timeline](#20-development-timeline)

---

## 1. System Overview

### The Problem

The micro-community advertising economy does not exist at scale because human transaction costs make it uneconomical. Negotiating a $30 sponsored post in a 500-person Discord server requires the same human hours as negotiating a $30,000 influencer deal. So the small deal never happens, and the community admin gets nothing.

Existing solutions:
- **Telegram Ads** — requires minimum spend (~€2 CPM), goes through Telegram centrally, not peer-to-peer
- **Paved / Swapstack** — newsletter-focused, humans still negotiate, no crypto settlement
- **Token-gated ad networks** — conceptual only, no autonomous agent negotiation exists

The gap: autonomous, reputation-gated, agent-negotiated micro-sponsorships with atomic crypto settlement.

### The Solution

AdMarket is a protocol where:

- A **Sponsor Agent** holds a mandate from a brand (budget, content rules, audience requirements) and autonomously seeks matching communities
- A **Community Agent** holds a mandate from a server admin (price floor, content restrictions, delivery channel) and autonomously evaluates incoming sponsor requests
- Both agents carry **ERC-8004 identity** — verifiable on-chain, portable across platforms
- Both agents carry a **reputation score** — queried before any negotiation begins, so spam and scam agents are filtered automatically at the handshake layer
- Agreed deals are **escrowed on-chain** — funds leave the sponsor's wallet before the ad runs
- Delivery is via **Discord/Telegram webhooks** — open APIs, designed to be called programmatically, no CAPTCHA
- Settlement is **optimistic** — 24-hour dispute window, then automatic release

### What Makes This Require ERC-8004 Specifically

Without on-chain agent identity:
- The Community Agent has no way to verify who is pinging it before spending LLM compute on negotiation
- There is no portable reputation the Sponsor Agent can present as a credential
- There is no permanent on-chain record that a deal happened, which breaks reputation accumulation

ERC-8004 is not decorative here. The identity and reputation registries are what make the spam filter, the negotiation trust, and the reputation compounding work without a centralized intermediary.

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ADMARKET PROTOCOL                           │
│                                                                     │
│  ┌─────────────┐          ┌──────────────────┐                      │
│  │   Brand /   │ sets up  │  SPONSOR AGENT   │                      │
│  │  Advertiser │ ──────►  │  (Node.js process│                      │
│  └─────────────┘          │   + wallet)      │                      │
│                           └────────┬─────────┘                      │
│                                    │                                 │
│                           1. Register on ERC-8004                   │
│                           2. Broadcast intent to Registry contract   │
│                                    │                                 │
│                           ┌────────▼──────────────────────────────┐ │
│                           │     IntentRegistry.sol (your contract) │ │
│                           │     "I want Web3 communities, 300+     │ │
│                           │      members, max 40 USDC/post"        │ │
│                           └────────┬──────────────────────────────┘ │
│                                    │                                 │
│                           COMMUNITY AGENT polls registry            │
│                                    │                                 │
│                           ┌────────▼─────────────┐                  │
│                           │  COMMUNITY AGENT      │                  │
│                           │  (Node.js process     │                  │
│                           │   + wallet + Discord  │                  │
│                           │   bot token)          │                  │
│                           └────────┬─────────────┘                  │
│                                    │                                 │
│              ┌─────────────────────┼───────────────────────┐        │
│              │                     │                        │        │
│    ┌─────────▼──────┐   ┌──────────▼───────┐  ┌───────────▼──────┐ │
│    │ ERC-8004        │   │ ReputationService  │  │  NEGOTIATION     │ │
│    │ IdentityRegistry│   │ (OpenClaw score   │  │  (JSON message   │ │
│    │ ReputationReg.  │   │  OR mock)        │  │   exchange,      │ │
│    │                 │   │                  │  │   2-3 rounds)    │ │
│    │ LIVE contracts: │   │  Returns 0-100   │  │                  │ │
│    │ 0x8004A169...   │   │  score for each  │  │  Claude API      │ │
│    │ (Base testnet)  │   │  agent wallet    │  │  evaluates       │ │
│    └─────────────────┘   └──────────────────┘  │  offers vs       │ │
│                                                 │  mandate         │ │
│                                                 └──────────────────┘ │
│                                    │                                 │
│                           Terms agreed                              │
│                                    │                                 │
│                           ┌────────▼──────────────────────────────┐ │
│                           │          AdEscrow.sol                  │ │
│                           │  Sponsor locks USDC                    │ │
│                           │  24-hour optimistic window             │ │
│                           │  Auto-releases or slashes on dispute   │ │
│                           └────────┬──────────────────────────────┘ │
│                                    │                                 │
│                           Community Agent posts ad                  │
│                                    │                                 │
│              ┌─────────────────────┼──────────────────┐             │
│              │                     │                   │             │
│    ┌─────────▼──────┐   ┌──────────▼──────┐  ┌────────▼──────────┐ │
│    │ Discord Webhook │   │ Telegram Bot API│  │  On-chain log:    │ │
│    │ (discord.js)    │   │ (telegraf)      │  │  message ID +     │ │
│    │                 │   │                 │  │  timestamp        │ │
│    └─────────────────┘   └─────────────────┘  └───────────────────┘ │
│                                    │                                 │
│                           Sponsor Agent verifies                    │
│                           (Discord read API, 24h window)            │
│                                    │                                 │
│                           ┌────────▼──────────────────────────────┐ │
│                           │ Settlement + Reputation Update         │ │
│                           │ USDC → Community Agent wallet          │ │
│                           │ Both ERC-8004 Reputation scores update │ │
│                           └────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. The Demo Loop

**This is the most important section. Build toward this. Everything else serves this.**

### Setup Before Judges Arrive

- Two agent processes running in separate terminal windows (or tmux panes), logs visible
- A real Discord server with a `#sponsored` channel, Community Agent bot already in the server
- Browser open on a simple React dashboard showing both agent states, escrow balance, reputation scores
- One pre-queued sponsor intent ready to fire

### The 90-Second Walkthrough

**0:00 — Frame the problem**
> "Right now, a 500-person Discord community and a Web3 brand cannot find each other efficiently. The deal is too small for human negotiation, too niche for Google Ads. This economy simply doesn't exist. AdMarket creates it."

**0:15 — Show agent identity**
Point to the dashboard. Show both agents with their ERC-8004 agent IDs and reputation scores.
> "Each agent has a permanent on-chain identity. Before they talk to each other, they check each other's scores. Low score — connection dropped before any compute is spent."

**0:25 — Trigger the negotiation**
Fire the pre-queued sponsor intent. Logs show:

```
[SponsorAgent] Broadcasting intent: Web3 community, 300+ members, max 40 USDC
[CommunityAgent] Detected intent from 0xSponsor...
[CommunityAgent] Checking ERC-8004 identity... ✓ Score: 78
[CommunityAgent] Score above threshold (70). Initiating negotiation.
[SponsorAgent] Received response from 0xCommunity...
[SponsorAgent] Checking ERC-8004 identity... ✓ Score: 82
[SponsorAgent] Offer: 30 USDC, 6h non-pinned
[CommunityAgent] Counter: 35 USDC (score premium applied)
[SponsorAgent] Accepted: 35 USDC
[SponsorAgent] Locking escrow...
```

**0:50 — Show escrow on-chain**
Click transaction hash in dashboard. Block explorer opens showing 35 USDC locked in AdEscrow contract.

**1:00 — Delivery**
```
[CommunityAgent] Posting to Discord channel #sponsored...
[CommunityAgent] Message delivered. ID: 1234567890123456789
[CommunityAgent] Logging message ID on-chain...
```

Discord server is open on screen. The sponsored message appears live.

**1:15 — Settlement**
For demo purposes, dispute window is set to 60 seconds (not 24 hours).
```
[SponsorAgent] Verifying delivery... message 1234567890123456789 found in guild 987654321
[SponsorAgent] Delivery confirmed. Releasing escrow.
[AdEscrow] 35 USDC → 0xCommunityWallet
[ReputationRegistry] Posting positive feedback for both agents
```

Dashboard shows both scores tick up.

**1:30 — One sentence**
> "Two agents. One deal. No humans. Atomic settlement. Portable reputation that makes the next deal cheaper to trust."

---

## 4. ERC-8004 Integration — Real Contracts

### Confirmed Live Contract Addresses

```typescript
// contracts/erc8004/addresses.ts

export const ERC8004_CONTRACTS = {
  // Ethereum Mainnet + Base (same address — singleton deployment)
  IDENTITY_REGISTRY: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  REPUTATION_REGISTRY: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',

  // Base Sepolia Testnet (use this for the hackathon)
  IDENTITY_REGISTRY_TESTNET: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
  REPUTATION_REGISTRY_TESTNET: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
} as const;

// Use Base Sepolia for hackathon — cheaper gas, same contracts
export const CHAIN_CONFIG = {
  id: 84532,
  name: 'Base Sepolia',
  rpcUrl: 'https://sepolia.base.org',
  blockExplorer: 'https://sepolia.basescan.org',
};
```

### Identity Registry ABI (Minimal — what you actually need)

```typescript
// contracts/erc8004/abis.ts

export const IDENTITY_REGISTRY_ABI = [
  // Register your agent — mints ERC-721 token
  'function register(string calldata agentURI) external returns (uint256 agentId)',

  // Get agent URI (points to off-chain JSON)
  'function tokenURI(uint256 agentId) external view returns (string)',

  // Get wallet associated with agent
  'function getAgentWallet(uint256 agentId) external view returns (address)',

  // Total agents registered
  'function totalSupply() external view returns (uint256)',

  // Owner of agent NFT
  'function ownerOf(uint256 agentId) external view returns (address)',
] as const;

export const REPUTATION_REGISTRY_ABI = [
  // Post feedback about an agent
  // score: 0-100, tag: category string, feedbackURI: IPFS/HTTPS to full feedback JSON
  'function postFeedback(uint256 agentId, uint256 score, string calldata tag, string calldata feedbackURI) external',

  // Get feedback count for agent
  'function getFeedbackCount(uint256 agentId) external view returns (uint256)',

  // Get specific feedback entry
  'function getFeedback(uint256 agentId, uint256 index) external view returns (address reviewer, uint256 score, string tag, string feedbackURI, uint256 timestamp)',
] as const;
```

### Agent Registration File Schema

This JSON file lives at a URL (IPFS or HTTPS) and is pointed to by the ERC-721 tokenURI. It's the agent's identity card.

```typescript
// types/agentCard.ts

export interface AgentCard {
  // Required by ERC-8004 spec
  type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1';
  name: string;
  description: string;

  // NFT display (makes it show nicely in wallets/explorers)
  image?: string;

  // Agent capabilities — what this agent can do
  skills: AgentSkill[];

  // Communication endpoints
  endpoints: {
    // Your agent's HTTP endpoint for receiving negotiation messages
    a2a?: string;
    // MCP endpoint if you have one
    mcp?: string;
  };

  // Payment address (where to send money)
  walletAddress: string;

  // Custom fields for AdMarket
  admarket?: {
    agentType: 'sponsor' | 'community';
    // For community agents: platform details
    platform?: 'discord' | 'telegram';
    memberCount?: number;
    // For sponsor agents: content policy
    contentPolicy?: string;
  };
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
}

// Example Sponsor Agent card
export const SPONSOR_AGENT_CARD: AgentCard = {
  type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
  name: 'AdMarket Sponsor Agent — Web3Brand',
  description: 'Autonomous sponsorship buyer agent. Seeks Web3 Discord communities for ad placement.',
  skills: [
    {
      id: 'sponsor.negotiate',
      name: 'Sponsorship Negotiation',
      description: 'Negotiates ad placement terms with community agents',
    },
  ],
  endpoints: {
    a2a: 'https://your-ngrok-url.ngrok.io/sponsor/a2a',
  },
  walletAddress: '0xYourSponsorWallet',
  admarket: {
    agentType: 'sponsor',
    contentPolicy: 'Web3 and crypto products only. No gambling. No scams.',
  },
};

// Example Community Agent card
export const COMMUNITY_AGENT_CARD: AgentCard = {
  type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
  name: 'AdMarket Community Agent — CryptoDevs Discord',
  description: 'Autonomous ad inventory seller. Manages sponsored slots for CryptoDevs Discord server.',
  skills: [
    {
      id: 'community.host',
      name: 'Ad Hosting',
      description: 'Posts sponsored content to Discord/Telegram community channels',
    },
  ],
  endpoints: {
    a2a: 'https://your-ngrok-url.ngrok.io/community/a2a',
  },
  walletAddress: '0xYourCommunityWallet',
  admarket: {
    agentType: 'community',
    platform: 'discord',
    memberCount: 847,
  },
};
```

### ERC-8004 Service

```typescript
// services/erc8004Service.ts
import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { IDENTITY_REGISTRY_ABI, REPUTATION_REGISTRY_ABI } from '../contracts/erc8004/abis';
import { ERC8004_CONTRACTS } from '../contracts/erc8004/addresses';

export class ERC8004Service {
  private publicClient;
  private walletClient;
  private account;

  constructor(privateKey: `0x${string}`) {
    this.account = privateKeyToAccount(privateKey);
    this.publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(process.env.BASE_SEPOLIA_RPC_URL),
    });
    this.walletClient = createWalletClient({
      account: this.account,
      chain: baseSepolia,
      transport: http(process.env.BASE_SEPOLIA_RPC_URL),
    });
  }

  // Register agent — call once per agent, returns agentId
  async registerAgent(agentCardUri: string): Promise<bigint> {
    const hash = await this.walletClient.writeContract({
      address: ERC8004_CONTRACTS.IDENTITY_REGISTRY_TESTNET,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'register',
      args: [agentCardUri],
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    // Parse agentId from Transfer event logs
    const agentId = this.parseAgentIdFromReceipt(receipt);
    console.log(`Agent registered. ID: ${agentId}, TX: ${hash}`);
    return agentId;
  }

  // Verify agent exists and get their wallet
  async getAgentWallet(agentId: bigint): Promise<string> {
    return await this.publicClient.readContract({
      address: ERC8004_CONTRACTS.IDENTITY_REGISTRY_TESTNET,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'getAgentWallet',
      args: [agentId],
    }) as string;
  }

  // Post reputation feedback after a deal completes
  async postFeedback(
    agentId: bigint,
    score: number,    // 0-100
    tag: string,      // e.g. "sponsorship.delivery"
    feedbackUri: string,
  ): Promise<void> {
    const hash = await this.walletClient.writeContract({
      address: ERC8004_CONTRACTS.REPUTATION_REGISTRY_TESTNET,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'postFeedback',
      args: [agentId, BigInt(score), tag, feedbackUri],
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`Feedback posted for agent ${agentId}: ${score}/100`);
  }

  // Get all feedback and compute average score
  async getReputationScore(agentId: bigint): Promise<number> {
    const count = await this.publicClient.readContract({
      address: ERC8004_CONTRACTS.REPUTATION_REGISTRY_TESTNET,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'getFeedbackCount',
      args: [agentId],
    }) as bigint;

    if (count === 0n) return 50; // Default neutral score for new agents

    let total = 0;
    for (let i = 0n; i < count; i++) {
      const feedback = await this.publicClient.readContract({
        address: ERC8004_CONTRACTS.REPUTATION_REGISTRY_TESTNET,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'getFeedback',
        args: [agentId, i],
      }) as [string, bigint, string, string, bigint];
      total += Number(feedback[1]);
    }

    return Math.round(total / Number(count));
  }

  private parseAgentIdFromReceipt(receipt: any): bigint {
    // ERC-721 Transfer event: Transfer(address from, address to, uint256 tokenId)
    const transferEvent = receipt.logs.find((log: any) =>
      log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
    );
    if (!transferEvent) throw new Error('Transfer event not found in receipt');
    return BigInt(transferEvent.topics[3]);
  }
}
```

---

## 5. Reputation Layer — ReputationService

```typescript
// services/reputationService.ts
import { ERC8004Service } from './erc8004Service';

export interface ReputationScore {
  agentId: string;
  walletAddress: string;
  score: number;        // 0-100
  source: 'erc8004' | 'mock';
  fetchedAt: number;
}

export interface IReputationService {
  getScore(walletAddress: string, erc8004AgentId?: bigint): Promise<ReputationScore>;
  isAboveThreshold(walletAddress: string, threshold: number, erc8004AgentId?: bigint): Promise<boolean>;
}

export class OnChainReputationService implements IReputationService {
  private cache = new Map<string, { score: ReputationScore; expires: number }>();

  async getScore(walletAddress: string, erc8004AgentId?: bigint): Promise<ReputationScore> {
    const cached = this.cache.get(walletAddress);
    if (cached && cached.expires > Date.now()) return cached.score;

    if (!erc8004AgentId) {
      return { agentId: '0', walletAddress, score: 50, source: 'erc8004', fetchedAt: Date.now() };
    }

    try {
      const erc8004 = new ERC8004Service(process.env.COMMUNITY_PRIVATE_KEY as `0x${string}`);
      const scoreValue = await erc8004.getReputationScore(erc8004AgentId);
      
      const score: ReputationScore = {
        agentId: String(erc8004AgentId),
        walletAddress,
        score: scoreValue,
        source: 'erc8004',
        fetchedAt: Date.now()
      };
      
      this.cache.set(walletAddress, { score, expires: Date.now() + 5 * 60 * 1000 });
      return score;
    } catch (err) {
      console.warn(`[ReputationService] Failed to fetch on-chain reputation:`, err);
      return { agentId: String(erc8004AgentId), walletAddress, score: 50, source: 'erc8004', fetchedAt: Date.now() };
    }
  }

  async isAboveThreshold(walletAddress: string, threshold: number, erc8004AgentId?: bigint): Promise<boolean> {
    const result = await this.getScore(walletAddress, erc8004AgentId);
    return result.score >= threshold;
  }
}

// ==========================================
// IMPLEMENTATION B: Mock (use when API is dead)
// ==========================================
export class MockReputationService implements IReputationService {
  private scores: Map<string, number>;

  constructor(fixedScores?: Record<string, number>) {
    // Preset scores for demo agents
    this.scores = new Map(Object.entries(fixedScores ?? {
      [process.env.SPONSOR_WALLET_ADDRESS ?? '']: 78,
      [process.env.COMMUNITY_WALLET_ADDRESS ?? '']: 82,
    }));
  }

  async getScore(walletAddress: string): Promise<ReputationScore> {
    await new Promise(r => setTimeout(r, 200)); // Simulate network delay
    return {
      agentId: '0',
      walletAddress,
      score: this.scores.get(walletAddress) ?? 65,
      source: 'mock',
      fetchedAt: Date.now(),
    };
  }

  async isAboveThreshold(walletAddress: string, threshold: number): Promise<boolean> {
    const result = await this.getScore(walletAddress);
    return result.score >= threshold;
  }
}

// ==========================================
// FACTORY — flip this boolean if openclaw API is dead
// ==========================================
import { ERC8004Service } from './erc8004Service';

const USE_MOCK_REPUTATION = process.env.USE_MOCK_REPUTATION === 'true';

export function createReputationService(): IReputationService {
  if (USE_MOCK_REPUTATION) {
    console.log('[ReputationService] Using MOCK implementation');
    return new MockReputationService();
  }
  console.log('[ReputationService] Using OpenClaw implementation with ERC-8004 fallback');
  return new OnChainReputationService();
}
```

---

## 6. Smart Contracts

Two contracts. Deploy in order: IntentRegistry first, AdEscrow second.

### 6.1 IntentRegistry.sol

Acts as the noticeboard. Sponsor Agents broadcast what they're looking for. Community Agents poll this.

```solidity
// SPDX-License-Reputationer: MIT
pragma solidity ^0.8.24;

contract IntentRegistry {
  struct SponsorIntent {
    address sponsorAgent;
    uint256 erc8004AgentId;
    uint256 maxBudgetUsdc;     // in USDC units (6 decimals)
    uint256 minMemberCount;
    string contentPolicy;      // IPFS URI to content rules JSON
    string adCopy;             // IPFS URI to ad content
    uint256 expiresAt;
    bool active;
  }

  mapping(uint256 => SponsorIntent) public intents;
  uint256 public intentCount;

  // Index by sponsor agent for quick lookup
  mapping(address => uint256[]) public intentsBySponsor;

  event IntentBroadcast(
    uint256 indexed intentId,
    address indexed sponsorAgent,
    uint256 maxBudgetUsdc,
    uint256 minMemberCount
  );
  event IntentCancelled(uint256 indexed intentId);
  event IntentFulfilled(uint256 indexed intentId, uint256 escrowId);

  function broadcastIntent(
    uint256 erc8004AgentId,
    uint256 maxBudgetUsdc,
    uint256 minMemberCount,
    string calldata contentPolicy,
    string calldata adCopy,
    uint256 ttlSeconds
  ) external returns (uint256) {
    uint256 id = intentCount++;
    intents[id] = SponsorIntent({
      sponsorAgent: msg.sender,
      erc8004AgentId: erc8004AgentId,
      maxBudgetUsdc: maxBudgetUsdc,
      minMemberCount: minMemberCount,
      contentPolicy: contentPolicy,
      adCopy: adCopy,
      expiresAt: block.timestamp + ttlSeconds,
      active: true
    });

    intentsBySponsor[msg.sender].push(id);
    emit IntentBroadcast(id, msg.sender, maxBudgetUsdc, minMemberCount);
    return id;
  }

  function cancelIntent(uint256 intentId) external {
    require(intents[intentId].sponsorAgent == msg.sender, 'Not your intent');
    intents[intentId].active = false;
    emit IntentCancelled(intentId);
  }

  function markFulfilled(uint256 intentId, uint256 escrowId) external {
    require(intents[intentId].sponsorAgent == msg.sender, 'Not your intent');
    intents[intentId].active = false;
    emit IntentFulfilled(intentId, escrowId);
  }

  // Returns active intents — called by Community Agents
  function getActiveIntents(
    uint256 offset,
    uint256 limit
  ) external view returns (SponsorIntent[] memory, uint256[] memory) {
    uint256 count = 0;
    for (uint256 i = offset; i < intentCount && count < limit; i++) {
      if (intents[i].active && intents[i].expiresAt > block.timestamp) count++;
    }

    SponsorIntent[] memory result = new SponsorIntent[](count);
    uint256[] memory ids = new uint256[](count);
    uint256 idx = 0;

    for (uint256 i = offset; i < intentCount && idx < count; i++) {
      if (intents[i].active && intents[i].expiresAt > block.timestamp) {
        result[idx] = intents[i];
        ids[idx] = i;
        idx++;
      }
    }

    return (result, ids);
  }
}
```

### 6.2 AdEscrow.sol

Holds funds. Manages the optimistic settlement window. Handles disputes.

```solidity
// SPDX-License-Reputationer: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

contract AdEscrow is ReentrancyGuard, Ownable {
  IERC20 public immutable usdc;

  enum EscrowStatus { FUNDED, DELIVERED, SETTLED, DISPUTED, REFUNDED }

  struct Escrow {
    address sponsorAgent;
    address communityAgent;
    uint256 amount;             // USDC (6 decimals)
    uint256 intentId;
    string deliveryProof;       // "discord:GUILD_ID:MESSAGE_ID" or "telegram:CHAT_ID:MESSAGE_ID"
    uint256 deliveredAt;
    uint256 settleAfter;        // deliveredAt + disputeWindow
    EscrowStatus status;
    uint256 sponsorErc8004Id;
    uint256 communityErc8004Id;
  }

  mapping(uint256 => Escrow) public escrows;
  uint256 public escrowCount;

  // Configurable dispute window — set to 60s for demo, 24h for production
  uint256 public disputeWindowSeconds = 24 hours;
  uint256 public protocolFeePercent = 2; // 2% fee on settled escrows

  // Protocol fee recipient
  address public feeRecipient;

  event EscrowFunded(
    uint256 indexed escrowId,
    address indexed sponsor,
    address indexed community,
    uint256 amount
  );
  event DeliveryLogged(uint256 indexed escrowId, string deliveryProof);
  event EscrowSettled(uint256 indexed escrowId, uint256 communityAmount, uint256 fee);
  event EscrowDisputed(uint256 indexed escrowId, address disputer);
  event EscrowRefunded(uint256 indexed escrowId);

  constructor(address _usdc, address _feeRecipient) Ownable(msg.sender) {
    usdc = IERC20(_usdc);
    feeRecipient = _feeRecipient;
  }

  // Called by Sponsor Agent after negotiation concludes
  function fundEscrow(
    address communityAgent,
    uint256 amount,
    uint256 intentId,
    uint256 sponsorErc8004Id,
    uint256 communityErc8004Id
  ) external nonReentrant returns (uint256) {
    require(amount > 0, 'Amount must be positive');
    require(
      usdc.transferFrom(msg.sender, address(this), amount),
      'USDC transfer failed'
    );

    uint256 id = escrowCount++;
    escrows[id] = Escrow({
      sponsorAgent: msg.sender,
      communityAgent: communityAgent,
      amount: amount,
      intentId: intentId,
      deliveryProof: '',
      deliveredAt: 0,
      settleAfter: 0,
      status: EscrowStatus.FUNDED,
      sponsorErc8004Id: sponsorErc8004Id,
      communityErc8004Id: communityErc8004Id
    });

    emit EscrowFunded(id, msg.sender, communityAgent, amount);
    return id;
  }

  // Called by Community Agent after posting ad
  // deliveryProof format: "discord:GUILD_ID:MESSAGE_ID" or "telegram:CHAT_ID:MESSAGE_ID"
  function logDelivery(
    uint256 escrowId,
    string calldata deliveryProof
  ) external {
    Escrow storage e = escrows[escrowId];
    require(msg.sender == e.communityAgent, 'Not community agent');
    require(e.status == EscrowStatus.FUNDED, 'Wrong status');
    require(bytes(deliveryProof).length > 0, 'Empty proof');

    e.deliveryProof = deliveryProof;
    e.deliveredAt = block.timestamp;
    e.settleAfter = block.timestamp + disputeWindowSeconds;
    e.status = EscrowStatus.DELIVERED;

    emit DeliveryLogged(escrowId, deliveryProof);
  }

  // Anyone can call this after dispute window closes — auto-settles
  function settle(uint256 escrowId) external nonReentrant {
    Escrow storage e = escrows[escrowId];
    require(e.status == EscrowStatus.DELIVERED, 'Not delivered');
    require(block.timestamp >= e.settleAfter, 'Dispute window open');

    e.status = EscrowStatus.SETTLED;

    uint256 fee = (e.amount * protocolFeePercent) / 100;
    uint256 communityAmount = e.amount - fee;

    require(usdc.transfer(e.communityAgent, communityAmount), 'Payment failed');
    if (fee > 0) require(usdc.transfer(feeRecipient, fee), 'Fee transfer failed');

    emit EscrowSettled(escrowId, communityAmount, fee);
  }

  // Sponsor Agent can dispute within the window
  function dispute(uint256 escrowId) external {
    Escrow storage e = escrows[escrowId];
    require(msg.sender == e.sponsorAgent, 'Not sponsor agent');
    require(e.status == EscrowStatus.DELIVERED, 'Not delivered');
    require(block.timestamp < e.settleAfter, 'Window closed');

    e.status = EscrowStatus.DISPUTED;
    emit EscrowDisputed(escrowId, msg.sender);
  }

  // Owner resolves disputes manually (MVP limitation — transparent to judges)
  function resolveDispute(uint256 escrowId, bool sponsorWins) external onlyOwner nonReentrant {
    Escrow storage e = escrows[escrowId];
    require(e.status == EscrowStatus.DISPUTED, 'Not disputed');

    if (sponsorWins) {
      e.status = EscrowStatus.REFUNDED;
      require(usdc.transfer(e.sponsorAgent, e.amount), 'Refund failed');
      emit EscrowRefunded(escrowId);
    } else {
      e.status = EscrowStatus.SETTLED;
      uint256 fee = (e.amount * protocolFeePercent) / 100;
      uint256 communityAmount = e.amount - fee;
      require(usdc.transfer(e.communityAgent, communityAmount), 'Payment failed');
      if (fee > 0) require(usdc.transfer(feeRecipient, fee), 'Fee transfer failed');
      emit EscrowSettled(escrowId, communityAmount, fee);
    }
  }

  // Admin: set dispute window (60 for demo, 86400 for production)
  function setDisputeWindow(uint256 seconds_) external onlyOwner {
    disputeWindowSeconds = seconds_;
  }
}
```

---

## 7. Agent Communication Protocol

Both agents communicate via HTTP POST to each other's A2A endpoint. All messages are signed with the sender's wallet (EIP-712). All messages are structured JSON — the LLM operates within these schemas, it does not produce freeform output.

### Message Types

```typescript
// types/messages.ts

// ---- Handshake (before LLM wakes up) ----

export interface HandshakeRequest {
  type: 'HANDSHAKE_REQUEST';
  senderAgentId: string;          // ERC-8004 agentId
  senderWallet: string;           // EVM wallet address
  senderReputationScore: number;    // self-reported — verified by recipient
  intentId: string;               // which IntentRegistry entry
  timestamp: number;
  signature: string;              // EIP-712 signature of this payload
}

export interface HandshakeResponse {
  type: 'HANDSHAKE_RESPONSE';
  accepted: boolean;
  reason?: string;                // if rejected: 'SCORE_TOO_LOW' | 'CONTENT_MISMATCH' | 'BUSY'
  recipientAgentId: string;
  recipientWallet: string;
  recipientReputationScore: number;
  memberCount?: number;           // community agent shares this for sponsor evaluation
  timestamp: number;
  signature: string;
}

// ---- Negotiation (LLM-driven) ----

export interface NegotiationOffer {
  type: 'OFFER';
  round: number;                  // 1, 2, 3 — hard cap at 3 rounds
  offeredPriceUsdc: number;       // in USDC (not wei)
  postDurationHours: number;
  postType: 'pinned' | 'standard';
  conditions?: string;            // any additional conditions
  timestamp: number;
  signature: string;
}

export interface NegotiationResponse {
  type: 'COUNTER' | 'ACCEPT' | 'REJECT';
  round: number;
  offeredPriceUsdc?: number;      // present if COUNTER
  postDurationHours?: number;     // present if COUNTER
  postType?: 'pinned' | 'standard';
  reason?: string;                // present if REJECT
  timestamp: number;
  signature: string;
}

// ---- Execution ----

export interface EscrowNotification {
  type: 'ESCROW_FUNDED';
  escrowId: string;
  txHash: string;
  amount: number;
  timestamp: number;
  signature: string;
}

export interface DeliveryNotification {
  type: 'DELIVERY_COMPLETE';
  escrowId: string;
  deliveryProof: string;          // "discord:GUILD_ID:MESSAGE_ID"
  txHash: string;                 // on-chain logDelivery tx
  timestamp: number;
  signature: string;
}
```

### Message Signing (EIP-712)

```typescript
// utils/signing.ts
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const EIP712_DOMAIN = {
  name: 'AdMarket',
  version: '1',
  chainId: 84532, // Base Sepolia
} as const;

export async function signMessage(
  payload: object,
  privateKey: `0x${string}`
): Promise<string> {
  const account = privateKeyToAccount(privateKey);
  const client = createWalletClient({ account, chain: baseSepolia, transport: http() });

  return client.signTypedData({
    domain: EIP712_DOMAIN,
    types: {
      Message: [{ name: 'hash', type: 'bytes32' }],
    },
    primaryType: 'Message',
    message: {
      hash: hashPayload(payload),
    },
  });
}

export function hashPayload(payload: object): `0x${string}` {
  const { keccak256, toBytes } = require('viem');
  return keccak256(toBytes(JSON.stringify(payload)));
}

export async function verifySignature(
  payload: object,
  signature: string,
  expectedSigner: string
): Promise<boolean> {
  const { recoverTypedDataAddress } = require('viem');
  const recovered = await recoverTypedDataAddress({
    domain: EIP712_DOMAIN,
    types: { Message: [{ name: 'hash', type: 'bytes32' }] },
    primaryType: 'Message',
    message: { hash: hashPayload(payload) },
    signature: signature as `0x${string}`,
  });
  return recovered.toLowerCase() === expectedSigner.toLowerCase();
}
```

---

## 8. Sponsor Agent Implementation

```typescript
// agents/sponsorAgent.ts
import Anthropic from '@anthropic-ai/sdk';
import { createPublicClient, createWalletClient, http, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { ERC8004Service } from '../services/erc8004Service';
import { createReputationService } from '../services/reputationService';
import { signMessage, verifySignature } from '../utils/signing';
import type {
  HandshakeRequest, HandshakeResponse,
  NegotiationOffer, NegotiationResponse,
  EscrowNotification
} from '../types/messages';

export interface SponsorMandate {
  budgetUsdc: number;           // total campaign budget
  maxPricePerPostUsdc: number;  // per-post ceiling
  minMemberCount: number;       // community size floor
  minReputationScore: number;     // counterparty score floor (spam gate)
  contentPolicy: string;        // human-readable content rules
  adCopy: string;               // the actual ad text to post
  campaignName: string;
}

export class SponsorAgent {
  private claude: Anthropic;
  private erc8004: ERC8004Service;
  private reputation = createReputationService();
  private account;
  private walletClient;
  private agentId: bigint | null = null;
  private mandate: SponsorMandate;
  private activeNegotiations = new Map<string, NegotiationOffer[]>();

  constructor(privateKey: `0x${string}`, mandate: SponsorMandate) {
    this.claude = new Anthropic();
    this.erc8004 = new ERC8004Service(privateKey);
    this.account = privateKeyToAccount(privateKey);
    this.walletClient = createWalletClient({
      account: this.account,
      chain: baseSepolia,
      transport: http(process.env.BASE_SEPOLIA_RPC_URL),
    });
    this.mandate = mandate;
  }

  async initialize(agentCardUri: string): Promise<void> {
    this.agentId = await this.erc8004.registerAgent(agentCardUri);
    console.log(`[SponsorAgent] Initialized. ERC-8004 Agent ID: ${this.agentId}`);
  }

  // Step 1: Broadcast intent to IntentRegistry
  async broadcastIntent(intentRegistryContract: any): Promise<bigint> {
    const intentId = await intentRegistryContract.write.broadcastIntent([
      this.agentId!,
      parseUnits(String(this.mandate.maxPricePerPostUsdc), 6),
      BigInt(this.mandate.minMemberCount),
      'ipfs://QmContentPolicy',  // upload mandate to IPFS in production
      'ipfs://QmAdCopy',
      BigInt(3600), // 1 hour TTL
    ]);
    console.log(`[SponsorAgent] Intent broadcast. ID: ${intentId}`);
    return intentId;
  }

  // Step 2: Receive handshake from Community Agent and verify
  async handleHandshake(request: HandshakeRequest): Promise<HandshakeResponse> {
    console.log(`[SponsorAgent] Handshake from ${request.senderWallet}`);

    // 1. Verify signature — ensure message is actually from who they claim
    const sigValid = await verifySignature(
      { type: request.type, senderAgentId: request.senderAgentId, intentId: request.intentId, timestamp: request.timestamp },
      request.signature,
      request.senderWallet
    );

    if (!sigValid) {
      return this.rejectHandshake('INVALID_SIGNATURE');
    }

    // 2. Verify ERC-8004 identity exists
    const agentWallet = await this.erc8004.getAgentWallet(BigInt(request.senderAgentId));
    if (agentWallet.toLowerCase() !== request.senderWallet.toLowerCase()) {
      return this.rejectHandshake('IDENTITY_MISMATCH');
    }

    // 3. Check Reputation Score — SPAM GATE (LLM never wakes up if this fails)
    const scoreResult = await this.reputation.getScore(
      request.senderWallet,
      BigInt(request.senderAgentId)
    );
    console.log(`[SponsorAgent] Counterparty score: ${scoreResult.score} (source: ${scoreResult.source})`);

    if (scoreResult.score < this.mandate.minReputationScore) {
      console.log(`[SponsorAgent] Score ${scoreResult.score} below threshold ${this.mandate.minReputationScore}. Rejecting.`);
      return this.rejectHandshake('SCORE_TOO_LOW');
    }

    // Handshake accepted — return our own info
    const myScore = await this.reputation.getScore(this.account.address, this.agentId ?? undefined);
    const payload = {
      type: 'HANDSHAKE_RESPONSE' as const,
      accepted: true,
      recipientAgentId: String(this.agentId),
      recipientWallet: this.account.address,
      recipientReputationScore: myScore.score,
      timestamp: Date.now(),
    };

    return {
      ...payload,
      signature: await signMessage(payload, process.env.SPONSOR_PRIVATE_KEY as `0x${string}`),
    };
  }

  // Step 3: LLM-driven negotiation — Sponsor Agent makes offers
  async makeOffer(
    communityWallet: string,
    communityScore: number,
    memberCount: number,
    round: number,
    previousCounter?: NegotiationResponse
  ): Promise<NegotiationOffer> {
    const history = this.activeNegotiations.get(communityWallet) ?? [];

    const systemPrompt = `You are a negotiation agent acting on behalf of an advertiser.
Your mandate is strict — you cannot exceed it:
- Maximum price per post: $${this.mandate.maxPricePerPostUsdc} USDC
- Content policy: ${this.mandate.contentPolicy}

The community has ${memberCount} members and a reputation score of ${communityScore}/100.
A higher score means you can trust them more. A score above 80 means minor premium is acceptable.

Your goal: close a deal within budget. Be reasonable. This is round ${round} of maximum 3.
If this is round 3, either accept their last counter or walk away — no more counters.

Respond ONLY with valid JSON matching this exact schema:
{
  "offeredPriceUsdc": number,
  "postDurationHours": number,
  "postType": "pinned" | "standard",
  "reasoning": "brief internal note"
}`;

    const userMessage = previousCounter
      ? `Their counter-offer: $${previousCounter.offeredPriceUsdc} USDC for ${previousCounter.postDurationHours}h ${previousCounter.postType} post. Make your response.`
      : `Initial offer round. Community has ${memberCount} members, score ${communityScore}/100. Make your opening offer.`;

    const response = await this.claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const parsed = JSON.parse(
      (response.content[0] as { type: 'text'; text: string }).text
    );

    // Hard clamp — mandate is law regardless of what LLM says
    const clampedPrice = Math.min(parsed.offeredPriceUsdc, this.mandate.maxPricePerPostUsdc);

    const offer: Omit<NegotiationOffer, 'signature'> = {
      type: 'OFFER',
      round,
      offeredPriceUsdc: clampedPrice,
      postDurationHours: parsed.postDurationHours ?? 6,
      postType: parsed.postType ?? 'standard',
      timestamp: Date.now(),
    };

    history.push({ ...offer, signature: '' });
    this.activeNegotiations.set(communityWallet, history);

    console.log(`[SponsorAgent] Round ${round} offer: $${clampedPrice} USDC, ${offer.postDurationHours}h ${offer.postType}`);

    return {
      ...offer,
      signature: await signMessage(offer, process.env.SPONSOR_PRIVATE_KEY as `0x${string}`),
    };
  }

  // Step 4: Fund escrow after deal accepted
  async fundEscrow(
    communityWallet: string,
    communityErc8004Id: bigint,
    agreedPriceUsdc: number,
    intentId: bigint,
    escrowContract: any,
    usdcContract: any
  ): Promise<string> {
    const amountWei = parseUnits(String(agreedPriceUsdc), 6);

    // Approve USDC spend
    await usdcContract.write.approve([escrowContract.address, amountWei]);

    // Fund escrow
    const txHash = await escrowContract.write.fundEscrow([
      communityWallet,
      amountWei,
      intentId,
      this.agentId!,
      communityErc8004Id,
    ]);

    console.log(`[SponsorAgent] Escrow funded. TX: ${txHash}`);
    return txHash;
  }

  // Step 5: Verify delivery during dispute window
  async verifyDelivery(deliveryProof: string): Promise<boolean> {
    // deliveryProof format: "discord:GUILD_ID:MESSAGE_ID"
    const [platform, guildId, messageId] = deliveryProof.split(':');

    if (platform === 'discord') {
      return this.verifyDiscordDelivery(guildId, messageId);
    } else if (platform === 'telegram') {
      return this.verifyTelegramDelivery(guildId, messageId);
    }
    return false;
  }

  private async verifyDiscordDelivery(guildId: string, messageId: string): Promise<boolean> {
    // Read-only Discord API call — no bot token needed for public servers
    // Uses the Sponsor Agent's own bot token for auth (read-only scope)
    try {
      const channelId = process.env.DEMO_DISCORD_CHANNEL_ID!;
      const response = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
        { headers: { Authorization: `Bot ${process.env.SPONSOR_DISCORD_BOT_TOKEN}` } }
      );

      if (!response.ok) {
        console.log(`[SponsorAgent] Message not found. Triggering dispute.`);
        return false;
      }

      const message = await response.json();
      // Verify it's in the correct guild and posted by the Community Agent's bot
      const validGuild = message.guild_id === guildId;
      const validAuthor = message.author?.bot === true;

      console.log(`[SponsorAgent] Delivery verified: guild=${validGuild}, bot=${validAuthor}`);
      return validGuild && validAuthor;
    } catch {
      return false;
    }
  }

  private async verifyTelegramDelivery(_chatId: string, _messageId: string): Promise<boolean> {
    // Telegram doesn't have a public message read API without bot membership
    // For demo: trust the proof, use dispute window as safety net
    console.log('[SponsorAgent] Telegram delivery — trusting proof (dispute window active)');
    return true;
  }

  private rejectHandshake(reason: string): HandshakeResponse {
    return {
      type: 'HANDSHAKE_RESPONSE',
      accepted: false,
      reason,
      recipientAgentId: String(this.agentId),
      recipientWallet: this.account.address,
      recipientReputationScore: 0,
      timestamp: Date.now(),
      signature: '',
    };
  }
}
```

---

## 9. Community Agent Implementation

```typescript
// agents/communityAgent.ts
import Anthropic from '@anthropic-ai/sdk';
import { privateKeyToAccount } from 'viem/accounts';
import { ERC8004Service } from '../services/erc8004Service';
import { createReputationService } from '../services/reputationService';
import { DeliveryService } from '../services/deliveryService';
import { signMessage, verifySignature } from '../utils/signing';
import type {
  HandshakeRequest, HandshakeResponse,
  NegotiationOffer, NegotiationResponse,
  DeliveryNotification
} from '../types/messages';

export interface CommunityMandate {
  platform: 'discord' | 'telegram';
  guildId: string;              // Discord server ID or Telegram chat ID
  channelId: string;            // which channel to post in
  memberCount: number;
  priceFloorUsdc: number;       // minimum acceptable price
  minSponsorScore: number;      // sponsor reputation floor
  contentRules: string[];       // ["no gambling", "no adult content"]
  maxAdsPerDay: number;
}

export class CommunityAgent {
  private claude: Anthropic;
  private erc8004: ERC8004Service;
  private reputation = createReputationService();
  private delivery: DeliveryService;
  private account;
  private agentId: bigint | null = null;
  private mandate: CommunityMandate;
  private adsPostedToday = 0;

  constructor(privateKey: `0x${string}`, mandate: CommunityMandate) {
    this.claude = new Anthropic();
    this.erc8004 = new ERC8004Service(privateKey);
    this.delivery = new DeliveryService();
    this.account = privateKeyToAccount(privateKey);
    this.mandate = mandate;
  }

  async initialize(agentCardUri: string): Promise<void> {
    this.agentId = await this.erc8004.registerAgent(agentCardUri);
    console.log(`[CommunityAgent] Initialized. ERC-8004 Agent ID: ${this.agentId}`);
  }

  // Receives incoming handshake from Sponsor Agent — HTTP POST to /community/a2a
  async handleHandshakeRequest(request: HandshakeRequest): Promise<HandshakeResponse> {
    console.log(`[CommunityAgent] Handshake from ${request.senderWallet}`);

    if (this.adsPostedToday >= this.mandate.maxAdsPerDay) {
      return this.rejectHandshake('BUSY', 'Daily ad limit reached');
    }

    // 1. Verify signature
    const sigValid = await verifySignature(
      { type: request.type, senderAgentId: request.senderAgentId, intentId: request.intentId, timestamp: request.timestamp },
      request.signature,
      request.senderWallet
    );
    if (!sigValid) return this.rejectHandshake('INVALID_SIGNATURE');

    // 2. Verify ERC-8004 identity
    const agentWallet = await this.erc8004.getAgentWallet(BigInt(request.senderAgentId));
    if (agentWallet.toLowerCase() !== request.senderWallet.toLowerCase()) {
      return this.rejectHandshake('IDENTITY_MISMATCH');
    }

    // 3. Spam gate — Reputation Score check
    const scoreResult = await this.reputation.getScore(
      request.senderWallet,
      BigInt(request.senderAgentId)
    );
    console.log(`[CommunityAgent] Sponsor score: ${scoreResult.score} (source: ${scoreResult.source})`);

    if (scoreResult.score < this.mandate.minSponsorScore) {
      console.log(`[CommunityAgent] Score too low (${scoreResult.score} < ${this.mandate.minSponsorScore}). Rejecting spam.`);
      return this.rejectHandshake('SCORE_TOO_LOW');
    }

    // Accepted — return community info for sponsor to evaluate
    const myScore = await this.reputation.getScore(this.account.address, this.agentId ?? undefined);
    const payload = {
      type: 'HANDSHAKE_RESPONSE' as const,
      accepted: true,
      recipientAgentId: String(this.agentId),
      recipientWallet: this.account.address,
      recipientReputationScore: myScore.score,
      memberCount: this.mandate.memberCount,
      timestamp: Date.now(),
    };

    return {
      ...payload,
      signature: await signMessage(payload, process.env.COMMUNITY_PRIVATE_KEY as `0x${string}`),
    };
  }

  // Evaluates incoming offer and responds (COUNTER / ACCEPT / REJECT)
  async evaluateOffer(offer: NegotiationOffer, adCopyUri: string): Promise<NegotiationResponse> {
    // Fetch ad copy from IPFS to check content rules
    const adCopy = await this.fetchAdCopy(adCopyUri);

    const systemPrompt = `You are a community manager agent protecting your Discord community.
Your mandate is strict — you cannot accept below your floor:
- Price floor: $${this.mandate.priceFloorUsdc} USDC
- Content rules: ${this.mandate.contentRules.join(', ')}
- Your community size: ${this.mandate.memberCount} members

Evaluate this incoming ad offer and the ad copy below.
First check if the ad copy violates any content rules. If it does, REJECT immediately.
If the price is at or above your floor, ACCEPT.
If the price is below your floor but close (within 20%), COUNTER at your floor.
If the price is far below or round 3, make a final decision.

This is round ${offer.round} of maximum 3.

Respond ONLY with valid JSON:
{
  "decision": "ACCEPT" | "COUNTER" | "REJECT",
  "counterPriceUsdc": number | null,
  "counterDurationHours": number | null,
  "counterPostType": "pinned" | "standard" | null,
  "reason": "brief reason if REJECT"
}`;

    const userMessage = `Offer: $${offer.offeredPriceUsdc} USDC for ${offer.postDurationHours}h ${offer.postType} post.
Ad copy to evaluate: "${adCopy}"`;

    const response = await this.claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const parsed = JSON.parse(
      (response.content[0] as { type: 'text'; text: string }).text
    );

    // Hard clamp — cannot accept below floor regardless of LLM decision
    if (parsed.decision === 'ACCEPT' && offer.offeredPriceUsdc < this.mandate.priceFloorUsdc) {
      parsed.decision = 'COUNTER';
      parsed.counterPriceUsdc = this.mandate.priceFloorUsdc;
    }

    console.log(`[CommunityAgent] Round ${offer.round} decision: ${parsed.decision}`);

    const responsePayload: Omit<NegotiationResponse, 'signature'> = {
      type: parsed.decision,
      round: offer.round,
      offeredPriceUsdc: parsed.counterPriceUsdc,
      postDurationHours: parsed.counterDurationHours,
      postType: parsed.counterPostType,
      reason: parsed.reason,
      timestamp: Date.now(),
    };

    return {
      ...responsePayload,
      signature: await signMessage(responsePayload, process.env.COMMUNITY_PRIVATE_KEY as `0x${string}`),
    };
  }

  // Post ad after escrow is confirmed
  async postAd(adCopy: string, escrowId: string): Promise<DeliveryNotification> {
    console.log(`[CommunityAgent] Posting ad for escrow ${escrowId}...`);

    let deliveryProof: string;

    if (this.mandate.platform === 'discord') {
      const messageId = await this.delivery.postToDiscord(
        this.mandate.channelId,
        adCopy
      );
      deliveryProof = `discord:${this.mandate.guildId}:${messageId}`;
    } else {
      const messageId = await this.delivery.postToTelegram(
        this.mandate.guildId,
        adCopy
      );
      deliveryProof = `telegram:${this.mandate.guildId}:${messageId}`;
    }

    this.adsPostedToday++;
    console.log(`[CommunityAgent] Delivered. Proof: ${deliveryProof}`);

    const notification: Omit<DeliveryNotification, 'signature'> = {
      type: 'DELIVERY_COMPLETE',
      escrowId,
      deliveryProof,
      txHash: '', // filled after on-chain log
      timestamp: Date.now(),
    };

    return {
      ...notification,
      signature: await signMessage(notification, process.env.COMMUNITY_PRIVATE_KEY as `0x${string}`),
    };
  }

  private async fetchAdCopy(uri: string): Promise<string> {
    if (uri.startsWith('ipfs://')) {
      const hash = uri.replace('ipfs://', '');
      const res = await fetch(`https://ipfs.io/ipfs/${hash}`);
      return res.text();
    }
    const res = await fetch(uri);
    return res.text();
  }

  private rejectHandshake(reason: string, detail?: string): HandshakeResponse {
    return {
      type: 'HANDSHAKE_RESPONSE',
      accepted: false,
      reason: detail ?? reason,
      recipientAgentId: String(this.agentId),
      recipientWallet: this.account.address,
      recipientReputationScore: 0,
      timestamp: Date.now(),
      signature: '',
    };
  }
}
```

---

## 10. Discord/Telegram Delivery Layer

```typescript
// services/deliveryService.ts
import { Client, GatewayIntentBits, TextChannel, EmbedBuilder } from 'discord.js';

export class DeliveryService {
  private discordClient: Client;
  private discordReady = false;

  constructor() {
    this.discordClient = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    });
  }

  async initDiscord(): Promise<void> {
    await this.discordClient.login(process.env.COMMUNITY_DISCORD_BOT_TOKEN);
    await new Promise<void>(resolve => this.discordClient.once('ready', () => {
      console.log(`[DeliveryService] Discord bot ready: ${this.discordClient.user?.tag}`);
      this.discordReady = true;
      resolve();
    }));
  }

  async postToDiscord(channelId: string, adCopy: string): Promise<string> {
    if (!this.discordReady) await this.initDiscord();

    const channel = await this.discordClient.channels.fetch(channelId) as TextChannel;
    if (!channel?.isTextBased()) throw new Error(`Channel ${channelId} not found or not text`);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📢 Sponsored')
      .setDescription(adCopy)
      .setFooter({ text: 'Sponsored via AdMarket Protocol • On-chain verified' })
      .setTimestamp();

    const message = await channel.send({ embeds: [embed] });
    console.log(`[DeliveryService] Discord message sent. ID: ${message.id}`);
    return message.id;
  }

  async postToTelegram(chatId: string, adCopy: string): Promise<string> {
    const botToken = process.env.COMMUNITY_TELEGRAM_BOT_TOKEN;
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `📢 *Sponsored*\n\n${adCopy}\n\n_Delivered via AdMarket Protocol_`,
          parse_mode: 'Markdown',
        }),
      }
    );

    const data = await response.json();
    if (!data.ok) throw new Error(`Telegram API error: ${data.description}`);

    console.log(`[DeliveryService] Telegram message sent. ID: ${data.result.message_id}`);
    return String(data.result.message_id);
  }
}
```

---

## 11. Optimistic Settlement

```typescript
// services/settlementService.ts

export class SettlementService {
  private pendingSettlements = new Map<string, {
    escrowId: string;
    deliveryProof: string;
    settleAfter: number;
    communityWallet: string;
    sponsorAgent: SponsorAgent;
    escrowContract: any;
    erc8004: ERC8004Service;
    sponsorAgentId: bigint;
    communityAgentId: bigint;
  }>();

  register(params: {
    escrowId: string;
    deliveryProof: string;
    settleAfterMs: number;
    communityWallet: string;
    sponsorAgent: SponsorAgent;
    escrowContract: any;
    erc8004: ERC8004Service;
    sponsorAgentId: bigint;
    communityAgentId: bigint;
  }): void {
    this.pendingSettlements.set(params.escrowId, {
      ...params,
      settleAfter: Date.now() + params.settleAfterMs,
    });
    console.log(`[Settlement] Escrow ${params.escrowId} registered. Settles at ${new Date(Date.now() + params.settleAfterMs).toISOString()}`);
  }

  // Run this on an interval (every 30 seconds)
  async processSettlements(): Promise<void> {
    const now = Date.now();

    for (const [escrowId, settlement] of this.pendingSettlements.entries()) {
      if (now < settlement.settleAfter) continue;

      try {
        // First: Sponsor Agent verifies delivery
        const verified = await settlement.sponsorAgent.verifyDelivery(settlement.deliveryProof);

        if (verified) {
          // Settle on-chain
          await settlement.escrowContract.write.settle([BigInt(escrowId)]);
          console.log(`[Settlement] Escrow ${escrowId} settled. ✓`);

          // Post reputation feedback for both agents
          await settlement.erc8004.postFeedback(
            settlement.communityAgentId,
            90,
            'sponsorship.delivery',
            'ipfs://QmPositiveFeedback'
          );
          await settlement.erc8004.postFeedback(
            settlement.sponsorAgentId,
            90,
            'sponsorship.payment',
            'ipfs://QmPositiveFeedback'
          );

          console.log(`[Settlement] ERC-8004 reputation updated for both agents.`);
        } else {
          // Dispute
          await settlement.escrowContract.write.dispute([BigInt(escrowId)]);
          console.log(`[Settlement] Escrow ${escrowId} DISPUTED. Admin review required.`);

          // Post negative feedback
          await settlement.erc8004.postFeedback(
            settlement.communityAgentId,
            10,
            'sponsorship.delivery.failed',
            'ipfs://QmNegativeFeedback'
          );
        }

        this.pendingSettlements.delete(escrowId);
      } catch (err) {
        console.error(`[Settlement] Error processing escrow ${escrowId}:`, err);
      }
    }
  }

  startProcessingLoop(intervalMs = 30_000): void {
    setInterval(() => this.processSettlements(), intervalMs);
    console.log(`[Settlement] Processing loop started. Interval: ${intervalMs}ms`);
  }
}
```

---

## 12. Spam Defense Architecture

Three layers. An agent must pass all three before any LLM compute is spent.

```
Layer 1: EIP-712 Signature Verification
  → Ensures sender is actually who they claim to be
  → Cost to attacker: zero (but required)
  → Rejects: spoofed wallet addresses

Layer 2: ERC-8004 Identity Verification
  → Checks that the claimed agentId actually maps to the sender's wallet
  → Rejects: fake/mismatched agent IDs

Layer 3: Reputation Score Gate
  → Queries OpenClaw or ERC-8004 ReputationRegistry
  → Score below threshold → hard reject, no LLM call
  → Rejects: new wallets with no history, known bad actors

--- LLM WAKES UP HERE ---

Layer 4 (implicit): Content Rule Check (inside LLM evaluation)
  → Community Agent LLM reads ad copy against content rules
  → Rejects: gambling, scams, adult content
```

The spam economics: to pass Layer 3, a spam wallet needs a real Reputation Score above threshold. Building that score requires actually posting good ads over time. The cost of building legitimate reputation to run spam is prohibitive relative to the spam payoff (max $50/post).

---

## 13. Project Structure

```
admarket/
├── agents/
│   ├── sponsorAgent.ts
│   └── communityAgent.ts
│
├── contracts/
│   ├── erc8004/
│   │   ├── addresses.ts
│   │   └── abis.ts
│   ├── AdEscrow.sol
│   └── IntentRegistry.sol
│
├── services/
│   ├── erc8004Service.ts
│   ├── reputationService.ts      ← OpenClaw / mock / ERC-8004 fallback
│   ├── deliveryService.ts      ← Discord + Telegram posting
│   └── settlementService.ts   ← Optimistic window processor
│
├── types/
│   ├── messages.ts
│   └── agentCard.ts
│
├── utils/
│   └── signing.ts              ← EIP-712 sign/verify
│
├── scripts/
│   ├── deploy.ts               ← Deploy IntentRegistry + AdEscrow
│   ├── registerAgents.ts       ← Register both agents on ERC-8004
│   ├── uploadAgentCards.ts     ← Upload JSON cards to IPFS
│   └── runDemo.ts              ← Full demo loop script
│
├── server/
│   ├── sponsorServer.ts        ← Express: receives community responses
│   └── communityServer.ts      ← Express: receives sponsor handshakes
│
├── frontend/
│   └── Dashboard.tsx           ← React: live agent states + escrow
│
├── test/
│   ├── AdEscrow.test.ts
│   ├── IntentRegistry.test.ts
│   └── negotiation.test.ts
│
├── hardhat.config.ts
├── .env.example
└── package.json
```

---

## 14. Dependencies

```json
{
  "dependencies": {
    "viem": "^2.0.0",
    "@anthropic-ai/sdk": "^0.39.0",
    "discord.js": "^14.0.0",
    "express": "^4.18.0",
    "dotenv": "^16.0.0",
    "ipfs-http-client": "^60.0.0"
  },
  "devDependencies": {
    "@nomicfoundation/hardhat-toolbox": "^4.0.0",
    "hardhat": "^2.22.0",
    "@openzeppelin/contracts": "^5.0.0",
    "typescript": "^5.0.0",
    "ts-node": "^10.9.0",
    "@types/express": "^4.17.0",
    "@types/node": "^20.0.0"
  }
}
```

---

## 15. Environment Variables

```bash
# .env.example

# ---- Blockchain ----
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
SPONSOR_PRIVATE_KEY=0x...
COMMUNITY_PRIVATE_KEY=0x...
SPONSOR_WALLET_ADDRESS=0x...
COMMUNITY_WALLET_ADDRESS=0x...

# ---- Deployed Contract Addresses (fill after deploy.ts) ----
INTENT_REGISTRY_ADDRESS=
AD_ESCROW_ADDRESS=

# ---- ERC-8004 Agent IDs (fill after registerAgents.ts) ----
SPONSOR_ERC8004_AGENT_ID=
COMMUNITY_ERC8004_AGENT_ID=

# ---- OpenClaw ----
openclaw_API_KEY=
# Set to 'true' if openclaw API is unavailable on hackathon day
USE_MOCK_REPUTATION=false

# ---- USDC (Base Sepolia testnet USDC) ----
USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# ---- Discord ----
# Community Agent's bot token (posts ads)
COMMUNITY_DISCORD_BOT_TOKEN=
# Sponsor Agent's bot token (verifies delivery — read-only scope)
SPONSOR_DISCORD_BOT_TOKEN=
DEMO_DISCORD_GUILD_ID=
DEMO_DISCORD_CHANNEL_ID=

# ---- Telegram (optional) ----
COMMUNITY_TELEGRAM_BOT_TOKEN=

# ---- Demo Settings ----
# Dispute window in seconds (60 for demo, 86400 for production)
DISPUTE_WINDOW_SECONDS=60

# ---- Agent Mandates ----
SPONSOR_MAX_PRICE_USDC=40
SPONSOR_MIN_MEMBERS=300
SPONSOR_MIN_COUNTERPARTY_SCORE=70
COMMUNITY_PRICE_FLOOR_USDC=25
COMMUNITY_MIN_SPONSOR_SCORE=70
COMMUNITY_MAX_ADS_PER_DAY=3
```

---

## 16. Deployment Sequence

Run exactly in this order. Each step depends on the previous.

```bash
# 1. Install dependencies
npm install

# 2. Compile contracts
npx hardhat compile

# 3. Get testnet ETH (Base Sepolia faucet)
# https://faucet.base.org — need both SPONSOR and COMMUNITY wallets funded

# 4. Get testnet USDC
# Base Sepolia USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
# Mint via Coinbase testnet faucet or Uniswap on testnet

# 5. Deploy contracts
npx ts-node scripts/deploy.ts
# → Copy IntentRegistry and AdEscrow addresses to .env

# 6. Upload agent cards to IPFS
npx ts-node scripts/uploadAgentCards.ts
# → Copy IPFS URIs to agentCard configs

# 7. Register agents on ERC-8004
npx ts-node scripts/registerAgents.ts
# → Copy agent IDs to .env

# 8. Authorize USDC spend
npx ts-node scripts/approveUsdc.ts

# 9. Start agent servers (two terminals or tmux)
npx ts-node server/communityServer.ts  # terminal 1
npx ts-node server/sponsorServer.ts    # terminal 2

# 10. Start demo
npx ts-node scripts/runDemo.ts
```

---

## 17. Demo Script

```typescript
// scripts/runDemo.ts
// Full end-to-end demo loop. Run this on stage.

async function runDemo() {
  console.log('\n====== ADMARKET DEMO ======\n');

  // 1. Show agent identities
  console.log('[Demo] Sponsor Agent ERC-8004 ID:', process.env.SPONSOR_ERC8004_AGENT_ID);
  console.log('[Demo] Community Agent ERC-8004 ID:', process.env.COMMUNITY_ERC8004_AGENT_ID);

  // 2. Broadcast sponsor intent
  console.log('\n[Demo] Broadcasting sponsor intent...');
  const intentId = await sponsorAgent.broadcastIntent(intentRegistryContract);
  await sleep(1000);

  // 3. Community agent detects intent and initiates handshake
  console.log('\n[Demo] Community agent detected intent. Initiating handshake...');
  // (In production this is event-driven — for demo, trigger manually)
  const handshake = await sponsorAgent.handleHandshake(mockHandshakeRequest);
  console.log(`[Demo] Handshake: ${handshake.accepted ? '✓ ACCEPTED' : '✗ REJECTED'}`);
  await sleep(1000);

  // 4. Negotiation rounds
  console.log('\n[Demo] Starting negotiation...');
  const offer1 = await sponsorAgent.makeOffer(communityWallet, 82, 847, 1);
  const response1 = await communityAgent.evaluateOffer(offer1, adCopyUri);
  console.log(`[Demo] Round 1: Sponsor offers $${offer1.offeredPriceUsdc} → Community ${response1.type}`);
  await sleep(500);

  if (response1.type === 'COUNTER') {
    const offer2 = await sponsorAgent.makeOffer(communityWallet, 82, 847, 2, response1);
    const response2 = await communityAgent.evaluateOffer(offer2, adCopyUri);
    console.log(`[Demo] Round 2: Sponsor offers $${offer2.offeredPriceUsdc} → Community ${response2.type}`);
    await sleep(500);
  }

  // 5. Fund escrow
  console.log('\n[Demo] Funding escrow...');
  const escrowTx = await sponsorAgent.fundEscrow(
    communityWallet, communityAgentId, agreedPrice, intentId, escrowContract, usdcContract
  );
  console.log(`[Demo] Escrow funded. TX: ${escrowTx}`);
  await sleep(2000);

  // 6. Community agent posts ad
  console.log('\n[Demo] Community agent posting ad to Discord...');
  const delivery = await communityAgent.postAd(adCopy, escrowId);
  console.log(`[Demo] Delivered! Proof: ${delivery.deliveryProof}`);
  await sleep(2000);

  // 7. Wait for dispute window (60s in demo mode)
  console.log(`\n[Demo] Waiting for ${process.env.DISPUTE_WINDOW_SECONDS}s dispute window...`);
  await sleep(Number(process.env.DISPUTE_WINDOW_SECONDS) * 1000);

  // 8. Settle
  console.log('\n[Demo] Verifying delivery and settling...');
  await settlementService.processSettlements();

  console.log('\n====== DEMO COMPLETE ======');
  console.log('Both agents\' ERC-8004 reputation scores updated.');
  console.log('Check block explorer for on-chain proof.');
}
```

---

## 18. Judge Q&A — Anticipated Questions

**"How is this different from just using a Discord bot?"**

A Discord bot does what its owner programmed it to do. These agents make autonomous decisions constrained by verifiable on-chain mandates. The Sponsor Agent's spending ceiling is cryptographically enforced — it cannot exceed it even if the LLM tries to. The Community Agent's content rules are evaluated by an LLM against ad copy it hasn't seen before. The deal execution and settlement require no human involvement. A bot is a tool. These are agents.

**"What prevents the Community Agent from lying about delivery?"**

The Sponsor Agent independently verifies via Discord's read API — not the Community Agent's claim. The verification happens during the 24-hour dispute window. If the message isn't there, the Sponsor Agent calls dispute and the escrow is withheld. The Community Agent's Reputation Score gets slashed. Running this scam requires burning real reputation capital that took real honest deals to build.

**"Can't someone just create a fake high-score identity?"**

Scores in ERC-8004's Reputation Registry are feedback posted by other agents from previous deals. You cannot self-post. Building a high score means completing real transactions with real counterparties over time. There's no shortcut because the registry is immutable and public.

**"Why Base Sepolia not Sei or the OpenClaw chain?"**

ERC-8004 contracts are live on Base testnet at deterministic addresses. Base Sepolia is EVM-compatible, well-documented, has a reliable faucet, and has battle-tested tooling. OpenClaw's own chain infrastructure, if it exists, isn't publicly documented. We build on the chain where the standard is actually deployed.

**"What's your business model?"**

2% protocol fee on every settled escrow, taken from the Community Agent's payment. At $30 average deal size, that's $0.60 per deal. This doesn't sound like much until you consider that the addressable market is hundreds of thousands of micro-communities that currently have zero monetization infrastructure. Volume is the model.

---

## 19. Known Limitations and Honest Answers

**Dispute resolution is manual in the MVP.**

The `resolveDispute` function requires the contract owner (you) to call it. This is an admin function, not automated. In production this would be replaced by a decentralized arbitration mechanism — staked validators, Kleros integration, or time-weighted vote. During the pitch, say this plainly: "Dispute resolution in v1 has an admin key. We've scoped it honestly. The dispute window and reputation slashing still create the right incentives even without automated resolution."

**Telegram delivery cannot be independently verified.**

Discord has a read API. Telegram's Bot API doesn't expose a public message-read endpoint without the bot being in the chat. So for Telegram deliveries, the Sponsor Agent cannot independently verify the message exists. Mitigation: reputation staking. The Community Agent's score is staked against every delivery claim. Lying is expensive. For the demo, stick to Discord where verification works cleanly.

**Agent card IPFS URIs need to be persistent.**

If you use a temporary IPFS gateway and it goes down, your agent cards become unreachable. Use Pinata or web3.storage to pin them permanently before demo day.

---

## 20. Development Timeline

| Phase | Hours | Deliverables |
|---|---|---|
| Environment setup | 1h | Wallets funded, RPC configured, Discord bots created |
| Contract deployment | 1h | IntentRegistry + AdEscrow deployed and verified |
| ERC-8004 registration | 1h | Both agents registered, agent cards on IPFS |
| ReputationService | 1h | Both implementations working, toggle tested |
| Agent communication | 3h | Handshake + negotiation flow end-to-end in logs |
| Delivery layer | 1h | Discord posting working, message ID captured |
| Escrow flow | 2h | Fund → deliver → settle loop on-chain |
| Settlement service | 1h | Dispute window, verification, auto-settle |
| Demo script | 1h | Full loop scripted and rehearsed |
| Frontend dashboard | 2h | Minimal React showing agent states + scores |
| Buffer + rehearsal | 3h | Bugs, edge cases, pitch rehearsal |
| **Total** | **17h** | Full demo loop + pitch ready |

---

*Built for OpenClaw × ERC-8004 Hackathon — Jakarta, May 15-16, 2026*
*Do not distribute before submission.*