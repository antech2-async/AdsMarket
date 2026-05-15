// ---- Handshake (before LLM wakes up) ----

export interface HandshakeRequest {
  type: 'HANDSHAKE_REQUEST';
  senderAgentId: string;          // ERC-8004 agentId
  senderWallet: string;           // EVM wallet address
  senderReputationScore: number;    // self-reported - verified by recipient
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
  round: number;                  // 1, 2, 3 - hard cap at 3 rounds
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
