import { createPublicClient, createWalletClient, decodeEventLog, formatEther, formatUnits, getAddress, http, parseAbi, parseUnits, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import adEscrowArtifact from '../artifacts/contracts/AdEscrow.sol/AdEscrow.json';
import intentRegistryArtifact from '../artifacts/contracts/IntentRegistry.sol/IntentRegistry.json';
import { runtimeChain, runtimeRpcUrl } from './chainConfig';

const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]);

export const AD_ESCROW_ABI = adEscrowArtifact.abi;
export const INTENT_REGISTRY_ABI = intentRegistryArtifact.abi;

export interface LiveAddresses {
  intentRegistry: Address;
  adEscrow: Address;
  usdc: Address;
}

export interface LivePreflightResult {
  ok: boolean;
  checks: Array<{
    id: string;
    ok: boolean;
    detail: string;
  }>;
}

export class LiveChainService {
  public readonly account;
  public readonly publicClient;
  public readonly walletClient;

  constructor(privateKey: Hex, rpcUrl = runtimeRpcUrl()) {
    this.account = privateKeyToAccount(privateKey);
    const chain = runtimeChain();
    this.publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });
    this.walletClient = createWalletClient({
      account: this.account,
      chain,
      transport: http(rpcUrl),
    });
  }

  async preflight(addresses: LiveAddresses, opts: {
    expectedWallet?: Address;
    minEth?: bigint;
    minUsdc?: bigint;
    label: string;
  }): Promise<LivePreflightResult> {
    const checks: LivePreflightResult['checks'] = [];
    const add = (id: string, ok: boolean, detail: string) => checks.push({ id, ok, detail });

    const chainId = await this.publicClient.getChainId();
    const chain = runtimeChain();
    add('chain.expected', chainId === chain.id, `Connected chainId=${chainId}, expected ${chain.id} (${chain.name}).`);

    if (opts.expectedWallet) {
      add(
        `${opts.label}.wallet.matchesPrivateKey`,
        this.account.address.toLowerCase() === opts.expectedWallet.toLowerCase(),
        `Private key resolves to ${this.account.address}.`,
      );
    }

    const ethBalance = await this.publicClient.getBalance({ address: this.account.address });
    add(
      `${opts.label}.eth.balance`,
      ethBalance >= (opts.minEth ?? 0n),
      `${opts.label} has ${formatEther(ethBalance)} ETH on Base Sepolia.`,
    );

    for (const [id, address] of Object.entries(addresses)) {
      const code = await this.publicClient.getCode({ address: address as Address });
      add(`contract.${id}.code`, Boolean(code && code !== '0x'), `${id} at ${address} ${code && code !== '0x' ? 'has code' : 'has no code'}.`);
    }

    const usdcBalance = await this.usdcBalance(addresses.usdc, this.account.address);
    add(
      `${opts.label}.usdc.balance`,
      usdcBalance >= (opts.minUsdc ?? 0n),
      `${opts.label} has ${formatUnits(usdcBalance, 6)} USDC.`,
    );

    return {
      ok: checks.every((check) => check.ok),
      checks,
    };
  }

  intentRegistry(address: Address) {
    return {
      address,
      read: {
        getActiveIntents: (args: readonly [bigint, bigint]) => this.publicClient.readContract({
          address,
          abi: INTENT_REGISTRY_ABI,
          functionName: 'getActiveIntents',
          args,
        }),
      },
      write: {
        broadcastIntent: async (args: readonly [bigint, bigint, bigint, string, string, bigint]) => {
          const hash = await this.walletClient.writeContract({
            address,
            abi: INTENT_REGISTRY_ABI,
            functionName: 'broadcastIntent',
            args,
          });
          await this.publicClient.waitForTransactionReceipt({ hash });
          return hash;
        },
        markFulfilled: async (args: readonly [bigint, bigint]) => {
          const hash = await this.walletClient.writeContract({
            address,
            abi: INTENT_REGISTRY_ABI,
            functionName: 'markFulfilled',
            args,
          });
          await this.publicClient.waitForTransactionReceipt({ hash });
          return hash;
        },
      },
    };
  }

  adEscrow(address: Address) {
    return {
      address,
      write: {
        fundEscrow: async (args: readonly [Address, bigint, bigint, bigint, bigint]) => {
          const hash = await this.walletClient.writeContract({
            address,
            abi: AD_ESCROW_ABI,
            functionName: 'fundEscrow',
            args,
          });
          await this.publicClient.waitForTransactionReceipt({ hash });
          return hash;
        },
        fundEscrowWithAgreement: async (args: readonly [Address, bigint, bigint, bigint, bigint, Hex, Hex]) => {
          const hash = await this.walletClient.writeContract({
            address,
            abi: AD_ESCROW_ABI,
            functionName: 'fundEscrowWithAgreement',
            args,
          });
          await this.publicClient.waitForTransactionReceipt({ hash });
          return hash;
        },
        logDelivery: async (args: readonly [bigint, string]) => {
          const hash = await this.walletClient.writeContract({
            address,
            abi: AD_ESCROW_ABI,
            functionName: 'logDelivery',
            args,
          });
          await this.publicClient.waitForTransactionReceipt({ hash });
          return hash;
        },
        settle: async (args: readonly [bigint]) => {
          const hash = await this.walletClient.writeContract({
            address,
            abi: AD_ESCROW_ABI,
            functionName: 'settle',
            args,
          });
          await this.publicClient.waitForTransactionReceipt({ hash });
          return hash;
        },
        dispute: async (args: readonly [bigint]) => {
          const hash = await this.walletClient.writeContract({
            address,
            abi: AD_ESCROW_ABI,
            functionName: 'dispute',
            args,
          });
          await this.publicClient.waitForTransactionReceipt({ hash });
          return hash;
        },
        setDisputeWindow: async (args: readonly [bigint]) => {
          const hash = await this.walletClient.writeContract({
            address,
            abi: AD_ESCROW_ABI,
            functionName: 'setDisputeWindow',
            args,
          });
          await this.publicClient.waitForTransactionReceipt({ hash });
          return hash;
        },
      },
    };
  }

  erc20(address: Address) {
    return {
      address,
      write: {
        approve: async (args: readonly [Address, bigint]) => {
          const hash = await this.walletClient.writeContract({
            address,
            abi: ERC20_ABI,
            functionName: 'approve',
            args,
          });
          await this.publicClient.waitForTransactionReceipt({ hash });
          return hash;
        },
      },
    };
  }

  async usdcBalance(token: Address, owner: Address): Promise<bigint> {
    return await this.publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [owner],
    }) as bigint;
  }

  async usdcAllowance(token: Address, owner: Address, spender: Address): Promise<bigint> {
    return await this.publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [owner, spender],
    }) as bigint;
  }

  async parseEscrowId(txHash: Hex): Promise<bigint> {
    const receipt = await this.publicClient.getTransactionReceipt({ hash: txHash });
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: AD_ESCROW_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === 'EscrowFunded') {
          return BigInt((decoded.args as any).escrowId);
        }
      } catch {
        // Ignore logs from USDC or other contracts.
      }
    }
    throw new Error(`EscrowFunded event not found in ${txHash}`);
  }

  async parseIntentId(txHash: Hex): Promise<bigint> {
    const receipt = await this.publicClient.getTransactionReceipt({ hash: txHash });
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: INTENT_REGISTRY_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === 'IntentBroadcast') {
          return BigInt((decoded.args as any).intentId);
        }
      } catch {
        // Ignore unrelated logs.
      }
    }
    throw new Error(`IntentBroadcast event not found in ${txHash}`);
  }
}

export function liveAddress(value: string | undefined, name: string): Address {
  if (!value || value.includes('...')) throw new Error(`${name} is missing`);
  return getAddress(value);
}

export function livePrivateKey(value: string | undefined, name: string): Hex {
  if (!value || value.includes('...') || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be a 32-byte 0x private key`);
  }
  return value as Hex;
}

export function parseUsdc(value: number | string): bigint {
  return parseUnits(String(value), 6);
}
