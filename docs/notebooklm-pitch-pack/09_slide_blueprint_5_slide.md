# 5-Slide Pitch Deck Blueprint

Format: maximum 5 slides  
Language: Bahasa Indonesia natural  
Audience: OpenClaw Agenthon judges and payment track reviewers  
Style: Agentic Sponsorship Deal Room  

## Slide 1 - Problem Statement

Title: AdSourcing  
Headline: Micro-sponsorship butuh agent yang bisa mengeksekusi, bukan marketplace lagi.

On-slide copy:

- Sponsorship komunitas masih manual: trust check, negosiasi, payment, delivery, proof.
- Untuk micro-deal, koordinasi manual bisa lebih mahal daripada nilai sponsorship.
- AdSourcing mengubah sponsorship menjadi workflow komersial yang dieksekusi agent.

Required proof point:

- Mention OpenClaw Agenthon 2026 and Best Payment Use Case track.

Visual direction:

- Large title `AdSourcing`.
- Two faint columns: Sponsor and Community.
- Center artifact: sponsorship deal room with three missing pieces: trust check, payment lock, delivery proof.
- Use clean off-white background and deep ink typography.
- Include a small sponsored post placeholder to make the sponsorship use case visible from slide one.
- Add small label: `Autonomous Micro-Sponsorship Protocol`.

Speaker note:

"Kami tidak membuat marketplace iklan lagi. Problem kami adalah execution layer. Sponsor dan community bisa saling tertarik, tapi deal kecil tetap berat karena harus manual negotiate, check trust, pay, verify delivery, dan simpan proof."

Design notes:

- Make this feel like a premium agent-commerce pitch, not a legal archive.
- Use one strong visual artifact, not many cards.

## Slide 2 - Solution Overview

Title: Two-Agent System  
Headline: SponsorAgent menjaga budget. CommunityAgent menjaga inventory.

On-slide copy:

- SponsorAgent membawa mandat sponsor: budget, max price, content policy, ad copy.
- CommunityAgent membawa mandat komunitas: floor price, content rules, inventory, delivery channel.
- Keduanya otonom, tetapi tetap dibatasi deterministic policy rails.
- Setiap agent punya ERC-8004-style agent ID yang terhubung ke wallet dan agent card.

Required proof point:

- Show that this satisfies AI Agent and Multi-Agent System requirements.
- Mention ERC-8004-style identity as the trust anchor for agent-to-agent verification.

Visual direction:

- Left: sponsor brief card with campaign, budget cap, ad copy, brand safety.
- Right: community inventory card with audience, floor price, content rules, ad slot.
- Middle: agent decision bridge with SponsorAgent and CommunityAgent as two operating nodes.
- Add policy gate chips: `signature`, `wallet`, `reputation`, `content`, `budget`.

Speaker note:

"Kedua user hanya memberi mandat. Setelah itu agent yang bertindak. SponsorAgent tidak boleh overspend. CommunityAgent tidak boleh menerima konten unsafe atau harga di bawah floor."

Design notes:

- Avoid humanoid agent illustration.
- Represent agents as decision nodes between real business artifacts: sponsor brief and community ad slot.

## Slide 3 - AI Agent Workflow / Architecture

Title: Agent Execution Loop  
Headline: Dari mandat sampai settlement, tanpa approval manual di tiap langkah.

On-slide copy:

1. Agent identity terdaftar
2. Signed handshake
3. Policy dan reputation checks
4. Negotiation antar-agent
5. Escrow funding
6. Delivery, settlement, proof

Required proof point:

- Mention proof bundle and payment receipt.
- Mention wallet-to-agent verification through the ERC-8004-style identity registry.

Visual direction:

- Horizontal flow line like a sponsorship operating rail.
- Each step is a compact artifact: agent ID badge, signed packet, policy chip, offer slip, escrow lock, sponsored post preview, delivery proof, receipt.
- Highlight `bad-case rejection before escrow` as a side branch.

Speaker note:

"Ini bukan chat recommendation. Agent benar-benar menggunakan tools: registry, signature verification, policy service, escrow contract, delivery service, dan proof writer."

Design notes:

- This is the most important autonomy slide.
- Make the flow readable at thumbnail size.

## Slide 4 - Key Features & Tech Stack

Title: Payment Rail + Tech Stack  
Headline: Pembayaran dikunci sebelum iklan dikirim. Settlement terjadi setelah proof.

On-slide copy:

- Fitur kunci: mandate, ERC-8004-style identity, policy gates, escrow, proof bundle, payment receipt.
- Core rail: USDC escrow dengan protocol fee accounting.
- DOKU Sandbox: jalur checkout/payment gateway fiat untuk payment track.
- Tech stack: TypeScript, Solidity, Hardhat, viem, Express, OpenClaw bridge.

Required proof point:

- Be honest: DOKU is sandbox/extension unless production merchant verification is complete.

Visual direction:

- Three-part rail:
  1. DOKU Sandbox checkout/payment link
  2. USDC escrow lock
  3. Settlement receipt with proof hash
- Big receipt artifact on the right.
- Use Escrow Green for locked funds, Settlement Gold for receipt, Signal Cyan for gateway/tool call.

Speaker note:

"Untuk track payment, core kami adalah escrow-backed payment. Sponsor mengunci dana sebelum delivery. Community dibayar setelah proof. DOKU kami posisikan sebagai sandbox fiat gateway path, sementara escrow menjaga accountable settlement."

Design notes:

- Do not show many payment logos.
- Do not overclaim DOKU live settlement.

## Slide 5 - Future Development / Impact

Title: Demo Proof + Impact  
Headline: Deal aman terselesaikan. Iklan berisiko berhenti sebelum escrow.

On-slide copy:

- Demo proof: local contracts deployed, test USDC minted, agents registered.
- ERC-8004-style identity registry mengikat agent ID ke wallet dan agent card.
- Happy path: negotiate -> escrow -> deliver -> settle -> receipt.
- Guardrail path: konten scam/gambling ditolak sebelum payment bergerak.
- Next: live contracts, verified DOKU merchant flow, real reputation, production custody.

Required proof point:

- Mention passing typecheck/tests if space allows.
- Mention OpenClaw tools exposed.

Visual direction:

- Two stacked evidence cards:
  - `SETTLED` payment receipt
  - `REJECTED BEFORE ESCROW` policy receipt
- Bottom row: next production steps.

Speaker note:

"Demo kami menunjukkan dua hal. Pertama, agent bisa menyelesaikan transaction loop. Kedua, autonomy-nya punya guardrail: unsafe ad tidak masuk escrow. Itu inti dari agentic commerce yang aman."

Design notes:

- End with proof, not vision-only.
- Keep future roadmap short and honest.
