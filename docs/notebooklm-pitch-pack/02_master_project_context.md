# Master Project Context

## Product Name

Use `AdSourcing` as the public product name.

The repository is named `AdsMarket`, but the pitch should use one consistent brand. Use:

> AdSourcing

## What The Product Does

AdSourcing lets two AI agents complete a community sponsorship transaction after humans give initial mandates.

Sponsor user gives:

- campaign name;
- budget;
- maximum price per post;
- minimum community size;
- minimum reputation score;
- content policy;
- ad copy;
- wallet/payment authority.

Community owner gives:

- platform;
- community/channel id;
- member count;
- price floor;
- minimum sponsor reputation;
- content rules;
- max ads per day;
- earning wallet.

The agents then execute:

1. SponsorAgent broadcasts or exposes campaign intent.
2. CommunityAgent evaluates whether the sponsor is worth engaging.
3. Agents exchange signed handshake messages.
4. Policy service verifies signature, wallet binding, timestamp freshness, and reputation.
5. SponsorAgent makes an offer within budget.
6. CommunityAgent evaluates ad copy, price floor, sponsor score, and inventory.
7. Agents accept, counter, or reject within maximum negotiation rounds.
8. SponsorAgent funds escrow.
9. CommunityAgent delivers the ad.
10. SponsorAgent verifies delivery.
11. Escrow settles payment.
12. System writes proof bundle and payment receipt.

## Core Components

### SponsorAgent

Represents the advertiser. It has a mandate and cannot exceed the max price per post. It signs messages, checks counterparty reputation, makes offers, and funds escrow.

### CommunityAgent

Represents the community owner. It has a price floor, content rules, and ad inventory. It rejects unsafe content before escrow, counters low offers, delivers accepted ads, and signs delivery proof.

### PolicyService

Deterministic guardrail layer. It checks:

- message signature validity;
- timestamp freshness;
- wallet matching against registry;
- reputation thresholds;
- sponsor budget ceiling;
- community inventory limit;
- content rules such as no gambling, no scams, no guaranteed returns.

### Smart Contracts

`IntentRegistry.sol` stores sponsor intents.

`AdEscrow.sol` handles:

- USDC escrow funding;
- delivery proof logging;
- dispute window;
- settlement;
- protocol fee;
- refund or dispute resolution;
- agreement hash and content hash binding.

### Evidence and Receipts

The system writes:

- decision receipts;
- policy trail;
- proof bundle;
- payment receipt.

Proof bundle includes signed messages, policy checks, events, tx hashes, delivery proof, escrow id, and final hash.

Payment receipt includes escrow id, amount, protocol fee, community payout, status, tx hashes, proof hash, and receipt id.

### OpenClaw Bridge

The bridge exposes AdSourcing as callable tools:

- status;
- run happy path;
- run bad case;
- run local agenthon flow;
- theater reset;
- sponsor broadcast;
- community handshake;
- sponsor offer;
- community decide;
- sponsor fund;
- community deliver;
- sponsor settle;
- get evidence.

This is important because the product can be called by an agent runtime, not only used through a dashboard.

## Current Demo Modes

### Fast Showcase

Runs happy path and bad-case rejection, then prints evidence.

### Agenthon Local Mode

Starts local Hardhat chain, deploys contracts, mints test USDC, registers agents, negotiates, funds escrow, logs delivery, settles payment, and writes proof/payment receipts.

### Two-Agent Theater Mode

Makes the two user points of view clearer by stepping through SponsorAgent and CommunityAgent actions.

### Discord Mode

Can use Discord bot delivery when env vars are configured.

### DOKU Sandbox Extension

The code includes a DOKU sandbox payment link path, but it should be described carefully as an extension. For a reliable hackathon demo, the core payment story remains USDC escrow plus receipts.

