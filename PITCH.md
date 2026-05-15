# AdSourcing Pitch Spine

## One-Line Pitch

AdSourcing is an accountable commerce agent pair that turns a sponsor's mandate into a negotiated, escrowed, delivered, and verified community sponsorship.

## What It Is

AdSourcing has two agents:

- `SponsorAgent`: represents a brand. It has a budget, content policy, audience requirement, wallet, and spending authority.
- `CommunityAgent`: represents a Discord or Telegram community. It has an inventory policy, price floor, content rules, delivery channel, and earning wallet.

After setup, the agents handle the transaction:

1. Discover a possible deal.
2. Verify identity, signature freshness, wallet binding, and reputation.
3. Negotiate inside hard mandate limits.
4. Fund escrow.
5. Deliver the sponsored post.
6. Verify delivery.
7. Settle payment and emit proof.

The dashboard is not the product. The contracts are not the product. The agents are the product.

## Why This Is An Agent, Not A Marketplace

A marketplace waits for humans to browse, compare, click, and approve.

AdSourcing agents act under delegated authority:

- They decide whether a counterparty is worth engaging.
- They reject unsafe or low-reputation interactions before spending money.
- They produce signed offers and responses.
- They move funds into escrow.
- They deliver and verify the result.
- They leave behind decision receipts and proof bundles.

The registry is only discovery. The agent is the actor.

## Specialty

Most "AI payment" demos stop at recommendation: "the AI suggests you should pay."

AdSourcing does the harder thing:

- Mandate-constrained autonomy: the agent cannot exceed budget or violate content policy.
- Pre-payment guardrails: malicious content and stale or forged messages are rejected before escrow.
- Real payment path: USDC approval, escrow, delivery logging, settlement, and protocol fee accounting.
- Decision receipts: every consequential action has an action, reason, risk level, policy trail, and proof reference.
- OpenClaw bridge: the same engine is exposed as callable agent tools instead of only as a standalone dashboard.

## 90-Second Demo Script

1. "A sponsor wants one community ad but does not want to manually source, negotiate, and verify it."
2. Run `npm run showcase` or the OpenClaw `adsourcing_run_happy_path` tool.
3. Show the signed handshake and policy checks.
4. Show the negotiation reaching an accepted price.
5. Show escrow funding and the payment receipt.
6. Show the delivery proof and proof bundle hash.
7. Run the bad-case demo: malicious gambling/scam copy is rejected before escrow.
8. Close with: "This is not a chatbot that talks about transactions. It is an agent that can be delegated a bounded commercial outcome."

## Judge Q&A

**Is this just a marketplace?**

No. The registry is a noticeboard. The submitted system is the agent pair that autonomously decides, negotiates, pays, delivers, verifies, and produces evidence.

**What prevents the LLM from overspending?**

The policy layer clamps and blocks outputs. The SponsorAgent has deterministic budget checks before any offer is signed or escrow is funded.

**What prevents unsafe ads?**

The CommunityAgent evaluates content rules before accepting. The bad-case demo proves this by rejecting malicious copy before escrow.

**What proves delivery?**

The delivery proof is signed and logged. In Discord mode, SponsorAgent can verify the message by Discord API before settlement.

**What is production-ready today?**

The agent engine, policy trail, proof bundle, payment receipt, OpenClaw bridge, and strict live-mode preflight are implemented.

**What still needs production hardening?**

Hosted OpenClaw gateway install, real deployed contracts, funded wallets, Discord permissions, non-mock reputation source, key custody, rate limiting, monitoring, and security review.
