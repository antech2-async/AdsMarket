# Architecture And Technical Proof

## High-Level Architecture

AdSourcing has four layers:

1. Agent Layer
2. Identity, Policy, and Memory Layer
3. Payment and Delivery Layer
4. Evidence and OpenClaw Layer

## Agent Layer

SponsorAgent:

- stores sponsor mandate;
- signs handshake and offers;
- checks community reputation;
- negotiates within max price;
- funds escrow;
- verifies delivery.

CommunityAgent:

- stores community mandate;
- verifies sponsor identity and score;
- enforces content rules;
- negotiates floor price;
- delivers ad;
- logs delivery proof.

## Identity, Policy, And Memory Layer

ERC-8004-style identity:

- registers SponsorAgent and CommunityAgent as agent IDs;
- binds each agent ID to a wallet;
- stores an agent card URI for metadata/capability description;
- lets the counterparty check that a signed message came from the wallet registered to that agent ID.

Reputation:

- stores feedback per agent ID;
- gives SponsorAgent and CommunityAgent a measurable trust score before negotiation and payment.

PolicyService:

- signature check;
- timestamp freshness;
- registry wallet matching;
- reputation threshold;
- sponsor budget max;
- community floor price;
- daily inventory limit;
- content rule enforcement.

DealStateService:

- stores deal phases;
- writes event history;
- attaches policy trail;
- writes decision receipts.

AgentMemoryService:

- persists mandates;
- writes sponsor/community snapshots;
- provides counterparty memory.

## Payment And Delivery Layer

Smart contracts:

- IntentRegistry for sponsor intent;
- AdEscrow for escrow, delivery proof, dispute, settlement, and protocol fee.

DeliveryService:

- Discord delivery;
- Telegram delivery;
- local demo adapter if real Discord is not configured.

SettlementService:

- verifies delivery;
- calls settlement;
- updates reputation feedback.

## Evidence And OpenClaw Layer

EvidenceService:

- builds proof bundle;
- hashes mandates and final bundle;
- includes signed messages, policy trail, tx hashes, delivery proof, escrow id.

PaymentReceiptService:

- computes protocol fee;
- computes community payout;
- writes payment receipt.

OpenClawBridgeServer:

- exposes agent functions as callable tools;
- lets OpenClaw or agent supervisor run the workflow.

Dashboard:

- shows flight recorder;
- displays mandates, deal phases, policy checks, proof bundles, payment receipts, and demo logs.

## Technical Stack

- TypeScript
- Node.js
- Express
- Hardhat
- Solidity
- viem
- Discord.js
- Google Gemini optional for negotiation/intake
- OpenClaw bridge/plugin
- DOKU Sandbox extension

## Technical Proof Points

Use these in the deck:

- Mock ERC-8004 identity registry registers agent IDs and maps them to wallets.
- Agent cards are generated as metadata intended for ERC-8004 agentURI values.
- Policy checks verify the sender wallet against the registered agent wallet before negotiation continues.
- `npm run typecheck` passes.
- `npm test` passes with policy/signing tests.
- Demo script can deploy local contracts and run the full loop.
- Proof bundle and payment receipt are written as JSON artifacts.
- Bad-case demo rejects unsafe content before escrow funding.

## Recommended Architecture Visual

Use a clean three-column map:

Column 1: Mandates and Agents  
SponsorAgent, CommunityAgent, ERC-8004-style agent IDs

Column 2: Trust and Execution  
Agent wallet registry, signature, reputation, policy gates, negotiation, escrow

Column 3: Outcome and Evidence  
Delivery, settlement, proof bundle, payment receipt, OpenClaw tools

Keep labels short. Do not show a dense code architecture diagram.
