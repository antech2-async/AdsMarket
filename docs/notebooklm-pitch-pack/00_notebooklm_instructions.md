# NotebookLM Instructions for AdSourcing Pitch Deck

Use this file as the main instruction source when generating the final pitch deck.

## Role

You are an expert hackathon pitch deck strategist, senior product storyteller, senior UI/UX designer, and technical product developer.

Your job is to create a polished, Canva-ready pitch deck for AdSourcing, an autonomous multi-agent sponsorship and payment protocol.

The deck must be understandable for non-technical judges while still credible for technical judges.

## Event Context

Event: OpenClaw Agenthon Indonesia 2026  
Format: 12-hour online build sprint  
Theme: Functional AI Agents and Multi-Agent Systems  
Additional track: Best Payment Use Case  
Product: AdSourcing  
Repo name: AdsMarket  
Deck language: Bahasa Indonesia natural, with technical English where clearer  
Pitch deck limit: maximum 5 slides, PDF format  
Demo video limit: maximum 2 minutes  

## Goal of the Deck

Make judges understand that AdSourcing is not a chatbot and not a regular ads marketplace.

The central message:

> AdSourcing turns a sponsor mandate into a negotiated, escrowed, delivered, verified, and settled community sponsorship.

Position AdSourcing as:

> Autonomous commercial agents for accountable micro-sponsorship.

The deck should convince judges that:

- The use case is real: community sponsorship is manual, trust-heavy, and hard to verify.
- The product has real agent behavior: reasoning, decision-making, tool usage, and workflow execution.
- The system is multi-agent: SponsorAgent and CommunityAgent act as separate principals.
- The payment workflow is not decorative: escrow and settlement are core to the product.
- The demo is real enough for hackathon: local chain, signed agents, escrow, receipts, proof bundle, and bad-case rejection.
- The team understands limitations: sandbox DOKU, local/testnet escrow, non-production custody, and future KYB/live payment work.

## Required Deck Format

Generate a polished 5-slide pitch deck outline. For each slide, include:

- Slide number
- Slide title
- Main headline
- Short on-slide copy
- Required proof point
- Suggested visual layout for Canva
- Speaker notes for a 3-4 minute pitch
- Design notes

Keep slide text concise. Put deeper explanation in speaker notes.

## Preferred 5-Slide Structure

1. Problem Statement - Manual sponsorship has no trusted execution layer.
2. Solution Overview - Two agents execute the sponsorship under bounded mandates.
3. AI Agent Workflow / Architecture - ERC-8004-style identity, signed handshake, policy gates, escrow, delivery, settlement, and proof.
4. Key Features & Tech Stack - Mandates, agent identity, reputation, policy rails, USDC escrow, DOKU Sandbox extension, OpenClaw bridge, and core stack.
5. Future Development / Impact - Demo proof, bad-case rejection, production path, and why this can scale accountable micro-sponsorship.

## Narrative Priorities

1. Open with a concrete problem: sponsor wants access to communities, community wants revenue, both lack trust and verification.
2. Immediately show why this is an AI Agent problem: humans should not manually source, negotiate, check policy, verify proof, and settle every micro-deal.
3. Explain the two-agent model clearly: SponsorAgent and CommunityAgent.
4. Highlight ERC-8004-style identity: each agent has an agent ID tied to wallet and agent card.
5. Show that agent autonomy is bounded by mandate and policy rails.
6. Show tool usage: registry, signatures, reputation, escrow contract, Discord delivery, proof receipt, OpenClaw tools.
7. Show payment strength: funds locked before delivery, settlement after proof, fee accounting, payment receipt.
8. Mention DOKU carefully as a sandbox fiat gateway extension, not the only payment rail.
9. End with demo evidence and impact, not abstract ambition.

## Language Rules

The deck must be in Bahasa Indonesia.

Use English only for fixed technical/product terms that sound more natural in English:

- AI Agent
- Multi-Agent System
- SponsorAgent
- CommunityAgent
- escrow
- settlement
- proof bundle
- payment receipt
- policy rail
- tool call
- mandate
- sandbox
- checkout
- payment link
- smart contract
- USDC
- DOKU Sandbox

Do not write full English headlines unless the term is a product/module name.

Bad:

- "Payment is locked before delivery."
- "From mandate to settlement, without manual step-by-step approval."
- "Future Development & Impact."

Good:

- "Pembayaran dikunci sebelum iklan dikirim."
- "Dari mandat sampai settlement, tanpa approval manual di tiap langkah."
- "Dampak dan langkah produksi berikutnya."

If a phrase mixes languages, keep the sentence Indonesian and preserve only the technical noun.

Example:

- "SponsorAgent menjaga budget, policy brand, dan batas harga."
- "CommunityAgent menjaga inventory, price floor, dan aturan konten."

## Best Framing Lines

Use these lines in the deck or speaker notes:

- "The dashboard is not the product. The agents are the product."
- "AdSourcing is not a chatbot recommending a transaction. It is an agent system completing one."
- "SponsorAgent protects budget and brand policy. CommunityAgent protects inventory, floor price, and content rules."
- "Payment is locked before delivery, and settlement only happens after proof."
- "Bad ads are rejected before escrow, not after damage is done."
- "DOKU gives the fiat payment gateway path; escrow gives the accountable settlement path."

## Claims To Use

Use these claims confidently:

- AdSourcing is an autonomous multi-agent sponsorship workflow.
- SponsorAgent and CommunityAgent negotiate under strict mandates.
- Deterministic policy rails prevent overspending and unsafe content.
- The system verifies signed messages, timestamp freshness, wallet binding, and reputation.
- The local demo deploys contracts, mints test USDC, registers agents, negotiates, funds escrow, logs delivery, settles payment, and writes receipts.
- Proof bundles include policy trail, signed messages, events, tx hashes, delivery proof, escrow id, and final hash.
- Payment receipts include escrow amount, protocol fee, community payout, status, tx hashes, and proof hash.
- DOKU should be described as sandbox/payment gateway extension for fiat checkout, not as fully verified production merchant settlement unless live verification is completed.

## Claims To Avoid

Do not say:

- "This is a marketplace."
- "The system is fully production-ready."
- "DOKU live settlement is already complete."
- "The AI can spend any amount."
- "The agent bypasses human consent."
- "All Discord communities and all sponsor types are supported today."
- "The payment is real fiat settlement in production" unless verified DOKU live account exists.
- "The system is decentralized end-to-end" because the demo uses local/testnet rails and centralized services.

Use safer polished language:

- "Production path is clear, but the hackathon demo runs on local/testnet infrastructure."
- "Agents are autonomous inside bounded mandates."
- "DOKU Sandbox demonstrates the fiat gateway path."
- "USDC escrow demonstrates the core accountable payment workflow."

## Visual Style Summary

Use:

> Agentic Sponsorship Deal Room

This is a premium agent-commerce deck with:

- clean light mode;
- crisp white/off-white surfaces;
- deep ink typography;
- sponsor/community deal cards;
- sponsored post preview;
- agent decision trail;
- policy gate chips;
- escrow lock;
- delivery proof;
- payment receipt;
- restrained proof stamps.

Do not use:

- generic AI gradient;
- robot mascot;
- crypto coin decorations;
- neon cyberpunk;
- random glowing networks;
- crowded dashboards;
- anime or character illustration;
- stock photos;
- all-purple palette.
- old parchment texture;
- excessive stamp collage;
- fake legal-document clutter.

## Best Prompt To Use In NotebookLM

After uploading all files in this pitch pack, use this prompt:

```text
Buat pitch deck 5 slide yang polished, Canva-ready, dan siap dipakai untuk OpenClaw Agenthon Indonesia 2026.

Audience: juri hackathon, mentor, product reviewer, developer, dan sponsor payment track.
Language: Bahasa Indonesia natural. Gunakan istilah teknis English jika lebih natural, seperti AI Agent, Multi-Agent System, escrow, settlement, proof bundle, payment receipt, policy rail, tool call, mandate, and sandbox.
Pitch length: 3-4 menit untuk deck, sisanya untuk demo video atau live demo.
Tone: senior, jelas, tajam, tidak lebay, tidak buzzword-heavy, dan demo-ready.

Ikuti batas guideline: pitch deck maksimal 5 slide. Jangan buat 10-12 slide.

Prioritas narasi:
1. Tekankan bahwa AdSourcing bukan marketplace iklan biasa dan bukan chatbot.
2. Jelaskan problem: sponsorship komunitas masih manual, trust-heavy, rawan unsafe content, dan susah membuktikan delivery/payment.
3. Jelaskan solution: SponsorAgent dan CommunityAgent menerima mandat, lalu menjalankan deal secara autonomous.
4. Tampilkan workflow: mandate -> discovery -> signed handshake -> policy/reputation checks -> negotiation -> escrow funding -> delivery -> verification -> settlement -> proof/payment receipt.
5. Tampilkan payment track: USDC escrow sebagai core accountable payment rail, DOKU Sandbox sebagai fiat gateway extension untuk checkout/payment link.
6. Tampilkan demo proof: local contracts, test USDC, signed agents, proof bundle, payment receipt, bad-case rejection before escrow.
7. Jaga klaim agar honest: DOKU adalah sandbox/extension kecuali production merchant verification sudah selesai.

Gunakan visual style:
- Agentic Sponsorship Deal Room;
- premium agent-commerce deck, bukan arsip kertas tua;
- light mode dengan white/off-white surface, deep ink, dan aksen biru-hijau yang restrained;
- one main artifact per slide;
- komponen utama: sponsor brief card, community inventory card, sponsored post preview, agent decision rail, policy gate chips, escrow lock, delivery proof, payment receipt;
- hubungan visual harus jelas: Sponsor -> SponsorAgent -> CommunityAgent -> Community -> Sponsored Post -> Proof -> Payment;
- jangan pakai robot, AI brain, neon network, crypto coin spam, anime, stock photo, generic SaaS dashboard, parchment texture, atau stempel berlebihan.

Untuk setiap slide, berikan:
1. Slide number
2. Slide title
3. Main headline
4. On-slide copy yang singkat tetapi kuat
5. Required proof point
6. Visual direction untuk Canva
7. Speaker notes untuk pitch 3-4 menit
8. Design notes

Ikuti slide blueprint dari source files. Buat deck terasa seperti product pitch yang kuat, bukan dokumentasi internal atau code walkthrough.
```
