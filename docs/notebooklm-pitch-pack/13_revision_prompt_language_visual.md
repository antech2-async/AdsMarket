# Revision Prompt - Language And Visual Upgrade

Use this file when NotebookLM already produced a draft deck but the language or design feels inconsistent.

## Main Problem To Fix

The draft may mix English and Indonesian too randomly. The revised deck must use Bahasa Indonesia as the default language.

English is allowed only for fixed technical nouns:

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

Do not use full English headlines.

Rewrite examples:

- "Micro-sponsorship needs accountable agents" -> "Micro-sponsorship butuh agent yang bisa mengeksekusi dengan bukti."
- "SponsorAgent protects budget" -> "SponsorAgent menjaga budget dan policy brand."
- "Payment is locked before delivery" -> "Pembayaran dikunci sebelum iklan dikirim."
- "Future Development & Impact" -> "Dampak dan langkah produksi berikutnya."

## Visual Problem To Fix

The design should not feel like:

- old parchment;
- legal archive;
- stamp collage;
- generic forms;
- too many document stacks;
- AI/crypto decorations.

The deck is about AI agents executing sponsorship. Therefore, each slide should connect:

Sponsor -> SponsorAgent -> CommunityAgent -> Community -> Sponsored Post -> Proof -> Payment

## Better Visual System

Use:

> Agentic Sponsorship Deal Room

This means:

- Sponsor brief card, not generic mandate card.
- Community inventory card, not generic mandate card.
- Agent decision bridge between sponsor and community.
- Sponsored post preview so the audience sees what is being bought.
- Policy gate chips as compact trust checks.
- Escrow lock as payment protection.
- Delivery proof ticket tied to the sponsored post.
- Payment receipt tied to settlement.

## Component Rules

### Sponsor Brief Card

Show:

- campaign;
- budget cap;
- ad copy;
- brand safety;
- minimum community score.

### Community Inventory Card

Show:

- channel/community;
- member count;
- ad slot;
- price floor;
- content rules.

### Agent Decision Bridge

Show:

- SponsorAgent receives sponsor brief.
- SponsorAgent sends signed offer.
- CommunityAgent checks inventory and content rules.
- CommunityAgent accepts, counters, or rejects.

No robot, no mascot, no human character needed.

### Sponsored Post Preview

Show:

- a clean Discord-like sponsored post preview;
- delivery proof id;
- community/channel label.

This is essential because the product is sponsorship, not only payment paperwork.

### Payment Rail

Show:

- DOKU Sandbox as checkout/payment link extension;
- USDC escrow as locked payment;
- payment receipt after proof.

Do not overclaim DOKU production settlement.

## Stronger NotebookLM Revision Prompt

Paste this into NotebookLM after uploading the source pack or after it creates a weak draft:

```text
Revisi pitch deck ini agar jauh lebih konsisten secara bahasa dan lebih kuat secara visual.

Aturan bahasa:
- Gunakan Bahasa Indonesia sebagai bahasa utama di semua headline dan body copy.
- English hanya boleh dipakai untuk istilah teknis yang umum: AI Agent, Multi-Agent System, SponsorAgent, CommunityAgent, escrow, settlement, proof bundle, payment receipt, policy rail, tool call, mandate, sandbox, checkout, payment link, smart contract, USDC, DOKU Sandbox.
- Jangan pakai headline full English.
- Jangan campur bahasa secara acak dalam satu kalimat.
- Ubah headline seperti "Payment is locked before delivery" menjadi "Pembayaran dikunci sebelum iklan dikirim."

Aturan visual:
- Jangan gunakan tema parchment tua, arsip hukum, stamp collage, atau dokumen legal yang terlalu ramai.
- Gunakan visual direction "Agentic Sponsorship Deal Room".
- Setiap slide harus menghubungkan sponsorship dan agent, bukan hanya menampilkan dokumen/receipt.
- Gunakan komponen: Sponsor Brief Card, Community Inventory Card, Agent Decision Bridge, Sponsored Post Preview, Policy Gate Chips, Escrow Lock, Delivery Proof Ticket, Payment Receipt.
- Minimal satu slide harus menampilkan Sponsored Post Preview agar jelas apa yang dibeli sponsor.
- Agent jangan digambar sebagai robot atau manusia. Tampilkan sebagai decision node yang menghubungkan sponsor brief dengan community inventory.
- Palette: white/off-white, deep ink, signal cyan untuk agent/tool call, escrow green untuk locked funds, settlement gold untuk receipt/proof, risk orange untuk policy gate, fault red untuk rejection.
- Kurangi texture, shadow berat, dan border berlapis. Buat lebih premium, clean, modern, dan pitch-ready.

Pertahankan struktur 5 slide:
1. Problem Statement
2. Solution Overview
3. AI Agent Workflow / Architecture and Technical Explanation
4. Key Features & Tech Stack
5. Future Development / Impact

Pastikan ERC-8004-style identity muncul eksplisit, terutama di slide 3 atau slide 4:
- setiap agent punya agent ID;
- agent ID terhubung ke wallet dan agent card;
- policy check memverifikasi signed message terhadap wallet yang terdaftar;
- sebut ini sebagai ERC-8004-style/local demo identity registry, bukan klaim full production compliance.

Untuk setiap slide, berikan:
1. Judul slide dalam Bahasa Indonesia
2. Headline utama dalam Bahasa Indonesia
3. On-slide copy singkat
4. Visual layout yang spesifik untuk Canva
5. Speaker notes singkat
6. Komponen visual yang harus digambar
```
