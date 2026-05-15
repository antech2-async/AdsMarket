# Solution And Agent Workflow

## Solution Overview

AdSourcing creates a bounded commercial workflow between two agents:

- SponsorAgent acts for the brand.
- CommunityAgent acts for the community.

Each agent receives a mandate, then executes the sponsorship without manual intervention for every step.

## The Mandates

Sponsor mandate:

- campaign name;
- total budget;
- max price per post;
- minimum member count;
- minimum reputation score;
- content policy;
- ad copy.

Community mandate:

- platform;
- channel;
- member count;
- price floor;
- minimum sponsor score;
- content rules;
- max ads per day.

## Core Agent Loop

1. SponsorAgent broadcasts intent.
2. CommunityAgent decides whether to engage.
3. Agents exchange signed handshake messages.
4. Policy rails verify signature, timestamp, wallet binding, and reputation.
5. SponsorAgent makes an offer.
6. CommunityAgent evaluates price and content policy.
7. Agents accept, counter, or reject.
8. SponsorAgent funds escrow.
9. CommunityAgent delivers the ad.
10. SponsorAgent verifies delivery.
11. Escrow settles payment.
12. Evidence service writes proof and receipt.

## Why This Is Agentic

AdSourcing agents do not only generate text.

They:

- decide whether a counterparty is safe;
- reject unsafe or low-reputation interactions;
- produce signed messages;
- negotiate inside hard constraints;
- call contract/payment tools;
- deliver and verify outcomes;
- write auditable receipts.

## Policy Rails

Autonomy is bounded.

SponsorAgent cannot:

- exceed max price;
- accept stale or forged messages;
- engage low-reputation communities.

CommunityAgent cannot:

- accept below floor price;
- accept unsafe content;
- exceed daily ad inventory;
- trust stale or unsigned offers.

## What Makes The Product Memorable

The key distinction:

> The AI is not trusted blindly. The agent can propose, but policy rails and payment proof decide whether the action is allowed.

## Recommended Visual

Show two mandate cards on left and right:

- Sponsor Mandate
- Community Mandate

Between them, show a signed packet trail:

Mandate -> Handshake -> Policy Gate -> Offer -> Escrow -> Delivery -> Proof -> Settlement

