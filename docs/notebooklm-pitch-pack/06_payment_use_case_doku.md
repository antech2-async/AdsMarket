# Payment Use Case And DOKU Positioning

## Payment Thesis

Payment is not an add-on in AdSourcing.

The sponsorship only becomes accountable when money is locked before delivery and settled after proof.

## Core Payment Rail

The core payment flow uses USDC escrow.

SponsorAgent:

1. approves USDC spend;
2. funds escrow with agreed price;
3. binds agreement hash and content hash when available.

CommunityAgent:

1. delivers the ad;
2. logs delivery proof to escrow;
3. receives settlement after dispute window and verification.

Escrow:

- stores sponsor and community agent addresses;
- stores amount;
- stores ERC-8004-style agent ids;
- stores delivery proof;
- supports dispute;
- settles to community minus protocol fee;
- emits events.

## Payment Receipt

After settlement, the system generates a payment receipt:

- receipt id;
- escrow id;
- amount;
- protocol fee percent;
- protocol fee amount;
- community payout;
- status;
- tx hashes;
- proof hash;
- generated timestamp.

## DOKU Sandbox

DOKU should be positioned as:

> The fiat payment gateway extension for checkout/payment-link simulation in sandbox.

Use DOKU carefully:

- Sandbox can demonstrate payment gateway integration without full live KYB.
- Production/live merchant settlement needs proper DOKU merchant activation and verification.
- For hackathon, DOKU Sandbox is enough to show the payment gateway path.

## What Not To Overclaim

Do not say:

- "DOKU live production settlement is complete."
- "No KYB is needed for production."
- "DOKU already pays out the community in this demo."

Safer line:

> The demo uses USDC escrow as the accountable payment rail and DOKU Sandbox as the fiat checkout extension. Production DOKU settlement would require merchant verification.

## Payment Track Framing

For Best Payment Use Case, emphasize:

- AI Agent triggers payment workflow;
- payment status affects agent action;
- funds are locked before delivery;
- settlement is proof-based;
- receipts are generated for audit;
- fiat gateway path exists through DOKU Sandbox.

## Recommended Visual

Use a three-part payment rail:

1. Sponsor checkout: DOKU Sandbox payment link / QRIS / VA extension.
2. Escrow lock: USDC held before delivery.
3. Settlement receipt: community payout, protocol fee, proof hash.

Use one large payment receipt artifact as the hero object.

