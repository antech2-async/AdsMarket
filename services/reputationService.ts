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

export class MockReputationService implements IReputationService {
  private scores: Map<string, number>;

  constructor(fixedScores?: Record<string, number>) {
    this.scores = new Map(Object.entries(fixedScores ?? {
      [process.env.SPONSOR_WALLET_ADDRESS ?? '']: 78,
      [process.env.COMMUNITY_WALLET_ADDRESS ?? '']: 82,
    }));
  }

  async getScore(walletAddress: string): Promise<ReputationScore> {
    await new Promise(r => setTimeout(r, 200));
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

export function createReputationService(): IReputationService {
  if (process.env.USE_MOCK_REPUTATION === 'true') {
    console.log('[ReputationService] Using MOCK implementation');
    return new MockReputationService();
  }
  console.log('[ReputationService] Using On-Chain ERC-8004 implementation');
  return new OnChainReputationService();
}
