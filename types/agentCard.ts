export interface AgentCard {
  // Required by ERC-8004 spec
  type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1';
  name: string;
  description: string;

  // NFT display
  image?: string;

  // Agent capabilities
  skills: AgentSkill[];

  // Communication endpoints
  endpoints: {
    a2a?: string;
    mcp?: string;
  };

  // Payment address
  walletAddress: string;

  // Custom fields for AdMarket
  admarket?: {
    agentType: 'sponsor' | 'community';
    platform?: 'discord' | 'telegram';
    memberCount?: number;
    contentPolicy?: string;
  };
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
}
