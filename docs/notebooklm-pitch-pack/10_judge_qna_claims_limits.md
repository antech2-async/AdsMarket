# Claims, Limitations, And Judge Q&A

## Strong Claims

Use these confidently:

- The product is a multi-agent sponsorship workflow.
- The agents are the product; the dashboard is a flight recorder.
- The system can run a complete local deal loop.
- Agent autonomy is bounded by policy rails.
- Bad content is rejected before escrow.
- Payment settlement generates receipts.
- Proof bundles make decisions auditable.
- OpenClaw bridge exposes the workflow as tools.

## Honest Limitations

Mention these if asked:

- The hackathon demo uses local/testnet infrastructure.
- Production DOKU use needs merchant activation and verification.
- Real wallet custody needs security hardening.
- Smart contracts need audit before production funds.
- Discord delivery requires bot permissions and operational monitoring.
- Reputation is demo/local unless connected to real production source.
- Content moderation is deterministic keyword-based today and should become stronger.

## Judge Q&A

### Is this just a marketplace?

No. A marketplace waits for users to browse and manually transact. AdSourcing agents act under delegated mandates: they verify, negotiate, fund escrow, deliver, verify, settle, and produce evidence.

### What makes it an AI Agent?

The system has bounded autonomous execution. Agents reason over mandates, evaluate counterparties, use tools, make decisions, and complete a workflow. It is not only a chat interface.

### What prevents the AI from overspending?

SponsorPolicy enforces the max price per post before an offer can be accepted or escrow can be funded.

### What prevents unsafe ads?

CommunityPolicy checks content rules before acceptance. The bad-case demo rejects unsafe copy before escrow funding.

### What proves delivery?

Delivery proof is logged, then included in the proof bundle. In Discord mode, SponsorAgent can verify the message through Discord API before settlement.

### What is the payment gateway?

Core payment uses USDC escrow. DOKU Sandbox is the fiat payment gateway extension for checkout/payment link flow. Production DOKU settlement would require merchant verification.

### Is DOKU KYB needed?

For sandbox demo, no full production KYB is needed. For live production merchant processing and settlement, DOKU account activation and verification are required.

### What is production-ready today?

The local agent workflow, policy trail, escrow flow, proof bundle, payment receipt, dashboard, and OpenClaw bridge are implemented for demo.

### What needs production hardening?

Live contracts, audited escrow, verified DOKU merchant flow, secure key custody, real reputation, better moderation, rate limiting, monitoring, and dispute operations.

### Why will this matter after the hackathon?

Because micro-sponsorship is a repeated commercial workflow. If agentic commerce becomes normal, small sponsorships need trust, payment, delivery, and proof rails that humans do not manually operate every time.

