# OpenClaw Agenthon Guidelines Fit

## What The Guidelines Prioritize

OpenClaw Agenthon Indonesia 2026 focuses on functional AI Agents and Multi-Agent Systems.

The project should show:

- reasoning;
- decision-making;
- tool usage;
- workflow execution;
- autonomous loop;
- at least one complete task without manual intervention after setup.

The project should not be:

- only a chatbot;
- only a visual UI without functional backend;
- only a wrapper around a standard AI model.

## Judging Criteria

The important scoring categories are:

- Use Case Clarity and Impact: 10%
- Creativity and Originality: 30%
- Autonomy and Agent Behaviour: 30%
- Technical Execution: 20%
- Real-World Deployability: 10%

## How AdSourcing Matches The Criteria

### Use Case Clarity and Impact

AdSourcing solves a concrete commercial workflow: community sponsorship sourcing, negotiation, payment, delivery, and verification.

The problem is easy to understand:

- sponsors want reliable community reach;
- community owners want monetization;
- both sides need trust, policy safety, and payment proof.

### Creativity and Originality

The project is not another ad marketplace. It reframes community sponsorship as an autonomous commercial agent workflow.

The original angle:

- two principals;
- two mandates;
- signed negotiation;
- deterministic policy guardrails;
- escrow-backed payment;
- proof bundle after settlement.

### Autonomy and Agent Behaviour

This is the strongest category.

AdSourcing shows:

- agents acting under delegated mandates;
- separate SponsorAgent and CommunityAgent roles;
- decision-making during handshake and negotiation;
- tool usage through registry, escrow, delivery, OpenClaw bridge, and evidence service;
- autonomous completion of a deal loop.

### Technical Execution

The project includes:

- TypeScript backend;
- Hardhat smart contracts;
- viem blockchain calls;
- ERC-8004-style identity and reputation services;
- policy service;
- Discord delivery service;
- proof and payment receipt generation;
- OpenClaw bridge;
- dashboard flight recorder.

### Real-World Deployability

The production path is clear but not complete:

- live payment gateway requires verified merchant setup;
- real contracts need deployment and audit;
- Discord permissions need production hardening;
- reputation source needs non-mock data;
- wallet custody needs secure design;
- monitoring, rate limits, and dispute operations are needed.

## Additional Track - Best Payment Use Case

AdSourcing should explicitly opt into the Best Payment Use Case track.

Payment is central:

- escrow is funded before delivery;
- community cannot be paid without delivery proof;
- sponsor has dispute window;
- settlement generates payment receipt;
- protocol fee is accounted for;
- DOKU Sandbox can be used as fiat gateway extension.

## Guideline Compliance Notes

The pitch deck must be maximum 5 slides and exported as PDF.

The demo video must be maximum 2 minutes and uploaded as unlisted YouTube link.

The repo should be public and include clear README instructions.

Important risk:

The official guideline says the GitHub repository should be created after the competition starts. If any commit history predates the official start time, the team should clarify whether those commits were starter setup/boilerplate or create a clean submission repo that only contains eligible build history.

