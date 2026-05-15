# Visual Consistency Prompt - Agentic Sponsorship Deal Room

Use this file to keep the final deck visually consistent.

## Final Visual Direction

The deck should use:

> Agentic Sponsorship Deal Room

This is a premium light-mode agent-commerce deck with sponsorship artifacts and proof artifacts.

## Core Look

- Clean white or warm off-white background.
- Deep ink typography.
- Precise grid alignment.
- One main artifact per slide.
- Sponsor brief card.
- Community inventory card.
- Agent decision bridge.
- Sponsored post preview.
- Signed packet trails.
- Policy gate chips.
- Escrow lock linework.
- Payment receipt cards.
- Proof bundle hashes.
- Minimal shadows.
- No visual clutter.

## Primary Palette

- Clean White: `#FBFCFA`
- Warm Canvas: `#F6F1E8`
- Deep Ink: `#101820`
- Graphite: `#5E6875`
- Porcelain: `#FFFFFF`
- Soft Line: `#D9DEE7`
- Signal Cyan: `#00A6B4`
- Escrow Green: `#1F9D68`
- Settlement Gold: `#B98218`
- Risk Orange: `#F26B3A`
- Fault Red: `#C93535`
- Agent Blue: `#3454D1`

## Typography

- Heading: Sora ExtraBold or Space Grotesk Bold.
- Body: Inter or DM Sans.
- Technical labels: IBM Plex Mono or DM Mono.

## Reusable Slide Templates

### 1. Sponsorship Deal Room Cover

Use for cover/problem.

Layout:

- Large `AdSourcing` title.
- Subtitle: `Autonomous Micro-Sponsorship Protocol`.
- One sponsorship deal room artifact with Sponsor, Community, Trust Check, Payment Lock, Delivery Proof.
- Include a small sponsored post preview, not only paperwork.
- Small track label: `OpenClaw Agenthon 2026 | Best Payment Use Case`.

### 2. Agent Sponsorship Bridge

Use for solution.

Layout:

- Left sponsor brief card.
- Right community inventory card.
- Center SponsorAgent -> CommunityAgent decision bridge.
- Bottom small policy gate chip row.

### 3. Sponsorship Execution Rail

Use for workflow.

Layout:

- Horizontal execution rail.
- Each milestone represented by a compact artifact.
- Include sponsored post preview near delivery.
- Side branch for rejected bad ad before escrow.

### 4. Payment Rail Receipt

Use for payment slide.

Layout:

- Left: DOKU Sandbox checkout extension.
- Center: USDC escrow lock.
- Right: settlement/payment receipt.
- One large receipt artifact.

### 5. Evidence Close

Use for final slide.

Layout:

- Two proof cards:
  - `SETTLED`
  - `REJECTED BEFORE ESCROW`
- Small roadmap strip below.

## Visual Negative Prompt

Do not use:

- robot mascot;
- AI brain;
- neon cyberpunk;
- glowing network mesh;
- crypto coin piles;
- parchment texture;
- law-office contract clutter;
- excessive stamps;
- anime characters;
- chibi mascot;
- fantasy backgrounds;
- random particles;
- generic purple gradients;
- dark dashboard overload;
- stock business people photos;
- overly complex smart contract diagrams.

## Canva / NotebookLM Prompt Add-On

Paste this after the main NotebookLM prompt if the visual output feels generic:

```text
For visual style, use Agentic Sponsorship Deal Room.

Do not create a generic SaaS dashboard deck. Do not use robots, AI brains, neon cyberpunk, glowing network meshes, crypto coin piles, anime characters, chibi mascots, stock photos, parchment texture, excessive stamps, or generic purple gradients.

Make the deck look like a premium fintech-agent product pitch:
- clean white or warm off-white background;
- deep ink typography;
- precise grids;
- sponsor brief card;
- community inventory card;
- agent decision bridge;
- sponsored post preview;
- signed packet trails;
- policy gate chips;
- escrow lock linework;
- payment receipt artifacts;
- proof bundle hashes;
- one main artifact per slide.

Use Signal Cyan for active agent/tool calls, Escrow Green for locked funds and verified actions, Settlement Gold for receipts/proof, Risk Orange for policy gates, Fault Red for unsafe rejection, and Agent Blue for OpenClaw tool layer.

The deck should feel like a sponsorship deal room with transaction proof, not a crypto poster, old legal archive, or AI chatbot deck.
```

