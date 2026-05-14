import { createPublicClient, createWalletClient, http, decodeEventLog } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { IDENTITY_REGISTRY_ABI, REPUTATION_REGISTRY_ABI } from '../contracts/erc8004/abis';
import { ERC8004_CONTRACTS } from '../contracts/erc8004/addresses';
import { withRetry } from '../utils/retryUtils';
import { runtimeChain, runtimeRpcUrl } from './chainConfig';

export class ERC8004Service {
  private publicClient;
  private walletClient;
  private account;

  constructor(privateKey: `0x${string}`) {
    this.account = privateKeyToAccount(privateKey);
    const chain = runtimeChain();
    this.publicClient = createPublicClient({
      chain,
      transport: http(runtimeRpcUrl()),
    });
    this.walletClient = createWalletClient({
      account: this.account,
      chain,
      transport: http(runtimeRpcUrl()),
    });
  }

  private identityRegistryAddress() {
    return (process.env.ERC8004_IDENTITY_REGISTRY_ADDRESS || ERC8004_CONTRACTS.IDENTITY_REGISTRY_TESTNET) as `0x${string}`;
  }

  private reputationRegistryAddress() {
    return (process.env.ERC8004_REPUTATION_REGISTRY_ADDRESS || ERC8004_CONTRACTS.REPUTATION_REGISTRY_TESTNET) as `0x${string}`;
  }

  // Register agent - call once per agent, returns agentId
  async registerAgent(agentCardUri: string): Promise<bigint> {
    return withRetry(async () => {
      const hash = await this.walletClient.writeContract({
        address: this.identityRegistryAddress(),
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'register',
        args: [agentCardUri],
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
      const agentId = this.parseAgentIdFromReceipt(receipt);
      console.log(`Agent registered. ID: ${agentId}, TX: ${hash}`);
      return agentId;
    }, { onRetry: (err, i) => console.warn(`[ERC8004] Registration retry ${i}...`) });
  }

  // Verify agent exists and get their wallet
  async getAgentWallet(agentId: bigint): Promise<string> {
    return withRetry(async () => {
      return await this.publicClient.readContract({
        address: this.identityRegistryAddress(),
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'getAgentWallet',
        args: [agentId],
      }) as string;
    });
  }

  // Post reputation feedback after a deal completes
  async postFeedback(
    agentId: bigint,
    score: number,    // 0-100
    tag: string,      // e.g. "sponsorship.delivery"
    feedbackUri: string,
  ): Promise<void> {
    await withRetry(async () => {
      const hash = await this.walletClient.writeContract({
        address: this.reputationRegistryAddress(),
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'postFeedback',
        args: [agentId, BigInt(score), tag, feedbackUri],
      });
      await this.publicClient.waitForTransactionReceipt({ hash });
      console.log(`Feedback posted for agent ${agentId}: ${score}/100`);
    }, { onRetry: (err, i) => console.warn(`[ERC8004] Feedback retry ${i}...`) });
  }

  // Get all feedback and compute average score
  async getReputationScore(agentId: bigint): Promise<number> {
    return withRetry(async () => {
      try {
        const count = await this.publicClient.readContract({
          address: this.reputationRegistryAddress(),
          abi: REPUTATION_REGISTRY_ABI,
          functionName: 'getFeedbackCount',
          args: [agentId],
        }) as bigint;

        if (count === 0n) return 50; // Default neutral score for new agents

        let total = 0;
        // Optimization: In a real app, we'd use a subgraph or batching.
        // For hackathon, we fetch last 5 entries to get a sense of recent rep.
        const maxFetch = count > 5n ? 5n : count;
        const startIdx = count - maxFetch;

        for (let i = startIdx; i < count; i++) {
          const feedback = await this.publicClient.readContract({
            address: this.reputationRegistryAddress(),
            abi: REPUTATION_REGISTRY_ABI,
            functionName: 'getFeedback',
            args: [agentId, i],
          }) as [string, bigint, string, string, bigint];
          total += Number(feedback[1]);
        }

        return Math.round(total / Number(maxFetch));
      } catch (err) {
        console.error('Error fetching reputation score:', err);
        return 50;
      }
    });
  }

  private parseAgentIdFromReceipt(receipt: any): bigint {
    // Better event parsing with viem
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: IDENTITY_REGISTRY_ABI,
          data: log.data,
          topics: log.topics,
        });
        
        // The IdentityRegistry is an ERC721, so we look for Transfer event
        // or a specific Registration event if it exists. Based on technicalspec, it's ERC721.
        if (decoded.eventName === 'Transfer' && decoded.args) {
          return (decoded.args as any).tokenId;
        }
      } catch {
        // Skip logs that don't match our ABI
      }
    }
    
    // Fallback to manual if viem fails to find it (for older deployments or custom events)
    const transferEvent = receipt.logs.find((log: any) =>
      log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
    );
    if (!transferEvent) throw new Error('Agent registration event not found in receipt');
    return BigInt(transferEvent.topics[3]);
  }
}
