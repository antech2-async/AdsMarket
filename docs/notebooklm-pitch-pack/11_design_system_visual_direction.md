# Design System And Visual Direction

## Visual Identity

Use this identity:

> Agentic Sponsorship Deal Room

This direction combines:

- premium fintech trust;
- clear sponsorship context;
- agent workflow clarity;
- payment receipt artifacts;
- sponsored post proof;
- technical proof without code clutter;
- clean editorial layout.

It should feel like:

- a high-end payment infrastructure pitch;
- an autonomous agent deal room;
- a sponsorship proof dossier;
- a calm but sharp hackathon-winning product deck.

It should not feel like:

- generic SaaS dashboard;
- crypto meme deck;
- neon cyberpunk trading screen;
- AI robot presentation;
- academic paper;
- crowded architecture wall;
- all-purple AI template;
- SpecHeal visual system.
- old paper archive;
- law-office contract deck;
- stamp-heavy bureaucracy.

## Core Visual Metaphor

AdSourcing turns a messy sponsorship negotiation into a verified sponsored post transaction.

The deck should repeatedly show:

- sponsor brief card;
- community inventory card;
- agent decision bridge;
- sponsored post preview;
- policy gate chips;
- escrow lock;
- delivery proof ticket;
- payment receipt;
- proof bundle hash;
- OpenClaw tool call chip.

## Color System

Use this primary color system:

| Role | Color | Hex |
| --- | --- | --- |
| Background | Clean White | `#FBFCFA` |
| Alternate background | Warm Canvas | `#F6F1E8` |
| Main text | Deep Ink | `#101820` |
| Muted text | Graphite | `#5E6875` |
| Surface | Porcelain | `#FFFFFF` |
| Border | Soft Line | `#D9DEE7` |
| Primary accent | Signal Cyan | `#00A6B4` |
| Escrow / locked funds | Escrow Green | `#1F9D68` |
| Settlement / receipt | Settlement Gold | `#B98218` |
| Risk / policy block | Risk Orange | `#F26B3A` |
| Fault / unsafe | Fault Red | `#C93535` |
| OpenClaw/tool signal | Agent Blue | `#3454D1` |

## Color Semantics

Use colors consistently:

- Signal Cyan = active agent/tool call.
- Escrow Green = funds locked, verified, safe.
- Settlement Gold = receipt, proof, settlement.
- Risk Orange = needs review, policy gate.
- Fault Red = unsafe content, rejected before escrow.
- Agent Blue = OpenClaw tool layer.

Most slides should be Clean White/Ledger Paper/Deep Ink with one accent.

## Typography

Recommended:

- Heading: Sora ExtraBold or Space Grotesk Bold.
- Body: Inter or DM Sans.
- Technical labels: IBM Plex Mono or DM Mono.

Use monospace only for:

- tx hash;
- proof hash;
- escrow id;
- tool name;
- signed packet labels;
- policy check ids.

## Layout Principles

- One slide = one claim.
- One main artifact per slide.
- Every slide should have a proof object.
- Prefer artifacts over paragraphs.
- Keep diagrams pitch-friendly.
- Use generous whitespace.
- Avoid visual noise.
- Make the payment/proof story visible.

## Visual Components

### Sponsor Brief Card

Use for sponsor-side context.

Fields:

- campaign;
- budget cap;
- ad copy;
- brand safety;
- minimum community score.

Style:

- white card;
- thin border;
- small sponsor label;
- one budget cap chip.

### Community Inventory Card

Use for community-side context.

Fields:

- channel/community;
- member count;
- ad slot;
- price floor;
- content rules.

Style:

- white card;
- thin border;
- small community label;
- one inventory chip.

### Agent Decision Bridge

Use between sponsor and community artifacts.

Visual:

- Sponsor brief flows into SponsorAgent.
- SponsorAgent sends signed offer to CommunityAgent.
- CommunityAgent checks inventory/content.
- CommunityAgent produces accept/reject.

This is the core visual that connects agent and sponsorship.

Do not show agents as robots or people. Show them as operating nodes with decisions and tool calls.

### Sponsored Post Preview

Use to make the sponsorship concrete.

Visual:

- clean Discord-like post preview;
- label: `Sponsored post`;
- small delivery proof id;
- subtle community/channel tag.

This should appear at least once in the deck so the audience sees what is being bought.

### Mandate Card

Use for Slide 2.

Card fields:

- role;
- mandate;
- hard limits;
- wallet/reputation;
- allowed action.

Style:

- white card;
- ledger border;
- small status stamp;
- one accent line.

### Signed Packet Trail

Use for agent workflow.

Packet labels:

- HANDSHAKE_REQUEST;
- HANDSHAKE_RESPONSE;
- OFFER;
- ACCEPT;
- DELIVERY_PROOF;
- SETTLEMENT_RECEIPT.

Style:

- slim horizontal or diagonal packet path;
- subtle arrows;
- stamp marks for verified steps.

### Policy Gate Chip

Use as small chips:

- SIGNATURE OK;
- WALLET MATCH;
- SCORE PASS;
- CONTENT SAFE;
- BUDGET OK;
- REJECTED BEFORE ESCROW.

### Escrow Vault

Use for payment slide.

Visual:

- simple box/vault silhouette made of lines;
- amount locked;
- intent id;
- escrow id;
- status.

Do not use literal coin piles.

### Payment Receipt Artifact

Use for Slide 4 and Slide 5.

Fields:

- escrow id;
- amount;
- protocol fee;
- community payout;
- status;
- proof hash.

### Proof Bundle Artifact

Use as a case-file card:

- signed messages;
- policy trail;
- tx hashes;
- delivery proof;
- final hash.

## Slide Template Families

### 1. Editorial Cover

Large product name, strong thesis, one transaction dossier artifact.

### 2. Two-Agent Sponsorship Bridge

Sponsor brief and community inventory connected by SponsorAgent and CommunityAgent decision nodes.

### 3. Sponsorship Execution Rail

Horizontal workflow with compact proof objects and one sponsored post preview.

### 4. Payment Rail

Three-part payment path: gateway, escrow, receipt.

### 5. Evidence Close

Two proof cards: settled happy path and rejected bad case.
