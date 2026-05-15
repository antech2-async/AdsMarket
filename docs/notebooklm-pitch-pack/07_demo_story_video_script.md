# Demo Story And 2-Minute Video Script

## Demo Goal

The demo should prove one thing:

> The agents can complete a bounded sponsorship transaction and reject a bad one before payment moves.

## Recommended Demo Path

Use the dashboard or CLI to show:

1. Sponsor and community mandates.
2. Two-agent POV run.
3. Signed handshake.
4. Policy checks passing.
5. Negotiation reaching accepted terms.
6. Escrow funded.
7. Delivery proof created.
8. Settlement and payment receipt.
9. Proof bundle.
10. Bad-case rejection before escrow.

## 2-Minute Video Structure

### 0:00-0:15 - Problem

"A sponsor wants one community ad, but today they still need to manually find a community, negotiate, check trust, pay, verify delivery, and keep proof."

Show:

- sponsor mandate card;
- community mandate card.

### 0:15-0:35 - Agent Setup

"In AdSourcing, both users give bounded mandates. SponsorAgent protects budget and brand policy. CommunityAgent protects price floor, inventory, and content rules."

Show:

- mandate fields;
- dashboard setup panel.

### 0:35-1:10 - Autonomous Loop

"The agents now run the workflow: signed handshake, reputation and wallet checks, policy gates, negotiation, and accepted terms."

Show:

- two-agent flow;
- policy verdicts;
- accepted offer.

### 1:10-1:35 - Payment And Proof

"After agreement, SponsorAgent locks payment in escrow. CommunityAgent delivers the ad. SponsorAgent verifies delivery, then settlement releases payment and writes a receipt."

Show:

- escrow funded;
- delivery proof;
- settlement;
- payment receipt;
- proof bundle hash.

### 1:35-1:55 - Bad Case

"If the ad copy is unsafe, CommunityAgent rejects it before escrow. No payment moves."

Show:

- rejection case;
- policy rule triggered;
- no escrow funded.

### 1:55-2:00 - Closing

"AdSourcing is not a chatbot recommending a transaction. It is a multi-agent system completing one."

## What To Show Visually

Must show:

- agent mandates;
- agent-to-agent flow;
- policy checks;
- escrow/payment receipt;
- proof bundle;
- bad-case rejection.

Avoid:

- long terminal scrolling;
- reading code;
- explaining every contract function;
- showing empty dashboard states;
- spending too much time on setup.

## Best Demo Button Order

If using dashboard:

1. Save mandates.
2. Run Two-Agent POV.
3. Open Proof + Payment Receipts.
4. Run Rejection Case.

If using CLI:

1. `npm run agenthon:local`
2. `npm run badcase`
3. Show `cache/proofs/*.proof.json`
4. Show `cache/payment-receipts/*.payment.json`

