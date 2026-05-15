import * as THREE from '/vendor/three/three.module.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const phases = [
  'DISCOVERED',
  'HANDSHAKE_VERIFIED',
  'NEGOTIATING',
  'AGREED',
  'ESCROW_FUNDED',
  'DELIVERED',
  'SETTLED',
];

const phaseStories = {
  DISCOVERED: {
    title: 'Intent Broadcast',
    summary: 'A sponsor intent enters the market: budget, audience floor, content policy, and ad copy reference become the starting evidence.',
    evidence: 'IntentRegistry event and sponsor mandate hash',
    color: 0x77b7ff,
  },
  HANDSHAKE_VERIFIED: {
    title: 'Identity Handshake',
    summary: 'The community agent checks freshness, EIP-712 signature recovery, ERC-8004 wallet binding, reputation, and daily inventory before any negotiation.',
    evidence: 'Signature, timestamp, registry wallet, score gate',
    color: 0x56f0ff,
  },
  NEGOTIATING: {
    title: 'Constrained Negotiation',
    summary: 'The agents exchange offers inside hard policy rails: sponsor budget ceiling, community quote, content rules, and round limit.',
    evidence: 'Signed offer, active quote, budget and price-floor policy',
    color: 0xb591ff,
  },
  AGREED: {
    title: 'Terms Accepted',
    summary: 'The community accepts only after deterministic policy confirms that the offer clears the active quote and content gates.',
    evidence: 'Accepted terms and policy verdict trail',
    color: 0x60f4ad,
  },
  ESCROW_FUNDED: {
    title: 'Escrow Locked',
    summary: 'Payment locks with agreement and content hashes, binding the economic action to the signed agent transcript.',
    evidence: 'fundEscrowWithAgreement, agreementHash, contentHash',
    color: 0xffc857,
  },
  DELIVERED: {
    title: 'Delivery Proved',
    summary: 'The community posts the ad and returns a signed delivery proof that settlement can verify.',
    evidence: 'Delivery proof string and logDelivery transaction',
    color: 0xff9b54,
  },
  SETTLED: {
    title: 'Settlement Closed',
    summary: 'After verification, escrow releases and reputation feedback is posted back into the agent economy.',
    evidence: 'Settlement tx, reputation feedback, proof bundle hash',
    color: 0x60f4ad,
  },
};

const phaseViews = {
  DISCOVERED: 'deal',
  HANDSHAKE_VERIFIED: 'policy',
  NEGOTIATING: 'policy',
  AGREED: 'deal',
  ESCROW_FUNDED: 'proof',
  DELIVERED: 'proof',
  SETTLED: 'proof',
};

const OPENCLAW_LLM_MODEL = 'zai/glm-5.1';

let cockpitData = null;
let selectedView = 'deal';
let activeDeal = null;
let selectedPhase = 'DISCOVERED';
let playbackTimer = null;
const intakeState = {
  sponsor: {
    messages: [
      ['agent', 'Ceritakan kebutuhan sponsorship kamu dengan bahasa natural. Kalau budget dan max price sudah jelas, aku bisa melengkapi sisanya dengan default yang aman.'],
    ],
    parsed: {},
  },
  community: {
    messages: [
      ['agent', 'Ceritakan slot komunitas yang mau dijual. Kalau floor price sudah jelas, aku bisa memakai default aman untuk score, rules, dan cadence.'],
    ],
    parsed: {},
  },
};

function short(value = '') {
  return String(value).length > 18 ? `${String(value).slice(0, 10)}...${String(value).slice(-6)}` : String(value);
}

function formatTime(ts) {
  return ts ? new Date(ts).toLocaleTimeString() : 'n/a';
}

function allChecks(deal) {
  return (deal?.policyTrail || []).flatMap((decision) => decision.checks || []);
}

function renderChecks(deal) {
  const checks = allChecks(deal).slice(-8);
  if (!checks.length) return '<p class="empty">Belum ada policy evidence.</p>';

  return `<div class="checks">${checks.map((check) => `
    <div class="check ${check.passed ? '' : 'failed'}">
      <b>${check.passed ? 'PASS' : 'BLOCK'}</b>
      <span>${check.id}: ${check.detail}</span>
    </div>
  `).join('')}</div>`;
}

function renderReceipts(deal) {
  const receipts = (deal?.decisionReceipts || []).slice(-3).reverse();
  if (!receipts.length) return '';

  return `<div class="receipt-list">${receipts.map((receipt) => `
    <div class="receipt ${receipt.risk}">
      <b>${receipt.action}</b>
      <span>${receipt.why}</span>
      <em>risk: ${receipt.risk}${receipt.proof?.length ? ` | ${receipt.proof.join(', ')}` : ''}</em>
    </div>
  `).join('')}</div>`;
}

function renderDeals(deals) {
  if (!deals.length) return '<p class="empty">Belum ada sponsorship deal. Mulai alur sponsorship untuk membuat protocol state pertama.</p>';

  return deals.map((deal) => `
    <article class="deal">
      <div class="deal-head">
        <div>
          <h3>${deal.dealId}</h3>
          <span class="label">${deal.perspective} perspective</span>
        </div>
        <span class="phase">${deal.phase}</span>
      </div>
      <div class="meta">
        <div><span class="label">Sponsor</span><span class="value" title="${deal.sponsorWallet || ''}">${short(deal.sponsorWallet || 'unknown')}</span></div>
        <div><span class="label">Community</span><span class="value" title="${deal.communityWallet || ''}">${short(deal.communityWallet || 'unknown')}</span></div>
        <div><span class="label">Updated</span><span class="value">${formatTime(deal.updatedAt)}</span></div>
      </div>
      ${renderChecks(deal)}
      ${renderReceipts(deal)}
    </article>
  `).join('');
}

function renderProofs(proofs) {
  if (!proofs.length) return '<p class="empty">Belum ada proof bundle.</p>';

  return proofs.slice(0, 8).map((proof) => `
    <div class="proof-row">
      <div>
        <strong>${proof.dealId}</strong>
        <div class="hash">${proof.finalHash}</div>
      </div>
      <span class="phase">${proof.phase}</span>
    </div>
  `).join('');
}

function renderPayments(payments) {
  if (!payments.length) return '<p class="empty">Belum ada payment receipt.</p>';

  return payments.slice(0, 8).map((payment) => `
    <div class="proof-row payment-row">
      <div>
        <strong>Escrow ${payment.escrowId}: $${payment.amountUsdc} ${payment.status}</strong>
        <div class="hash">${payment.receiptId}</div>
        <span class="label">Community payout $${payment.communityPayoutUsdc} | protocol fee $${payment.protocolFeeUsdc}</span>
      </div>
      <span class="phase">${payment.protocolFeePercent}% fee</span>
    </div>
  `).join('');
}

function renderPolicyTrail(deals) {
  const checks = deals.flatMap((deal) => allChecks(deal).map((check) => ({ ...check, dealId: deal.dealId })));
  if (!checks.length) return '<p class="empty">Belum ada policy trail.</p>';

  return checks.slice(-14).reverse().map((check) => `
    <div class="policy-card">
      <div class="check ${check.passed ? '' : 'failed'}">
        <b>${check.passed ? 'PASS' : 'BLOCK'}</b>
        <span>${check.id}</span>
      </div>
      <span class="label">${check.dealId}</span>
      <p>${check.detail}</p>
    </div>
  `).join('');
}

function renderRedteam(redteam) {
  if (!redteam) return '<p class="empty">Belum ada risk review. Jalankan uji konten berisiko untuk melihat hasilnya.</p>';
  return `
    <div class="redteam-score">${redteam.passed}/${redteam.total}</div>
    <p class="label">Last run ${formatTime(redteam.generatedAt)}</p>
    <p>Hostile inputs tested stale signatures, forged wallets, scam copy, low quote attempts, over-budget offers, and invalid rounds.</p>
  `;
}

function latestByTime(items = []) {
  return [...items].sort((a, b) => Number(b.generatedAt ?? b.updatedAt ?? 0) - Number(a.generatedAt ?? a.updatedAt ?? 0))[0] || null;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function sponsorDisplayName(data = {}, theater = {}) {
  const mandate = data?.mandates?.sponsor?.mandate || {};
  const name = mandate.campaignName || theater.sponsor?.name || 'OpenClaw Sponsor Campaign';
  return /two-agent theater/i.test(name) ? 'OpenClaw Sponsor' : name;
}

function communityDisplayName(data = {}, theater = {}) {
  const mandate = data?.mandates?.community?.mandate || {};
  if (mandate.communityName) return mandate.communityName;
  const platform = mandate.platform || theater.community?.platform || 'Discord';
  return platform === 'telegram' ? 'Telegram Builder Community' : 'AI Builders Indonesia';
}

function sponsoredPostCopy(rawCopy = '') {
  if (!rawCopy || /two-agent theater/i.test(rawCopy)) {
    return 'Build with autonomous agent infra. Sponsored placement verified with escrow and proof.';
  }
  return rawCopy;
}

function renderRegistry(data) {
  const theater = data?.theater || {};
  const mandates = data?.mandates || {};
  const latestProof = latestByTime(data?.proofs || []);
  const latestPayment = latestByTime(data?.payments || []);
  const sponsorMandate = mandates.sponsor || {};
  const communityMandate = mandates.community || {};
  const sponsorScore = firstDefined(theater.handshake?.sponsorScore, latestProof?.reputationSources?.sponsor?.score, data?.memory?.sponsor?.score);
  const communityScore = firstDefined(theater.handshake?.communityScore, latestProof?.reputationSources?.community?.score, data?.memory?.community?.score);
  const chain = latestProof?.chain || {};
  const status = theater.status || data?.runState?.status || latestPayment?.status || 'waiting';
  const mem9 = data?.memory?.mem9 || {};
  const mem9State = mem9.configured
    ? (mem9.lastWriteAt ? 'Mem9 wrote deal memory ' + new Date(mem9.lastWriteAt).toLocaleTimeString() : 'Mem9 configured, waiting for deal write')
    : 'Mem9 not configured for runtime writes';
  const doku = data?.doku || {};
  const dokuState = doku.enabled
    ? (doku.configured ? (doku.lastPaymentUrl ? 'DOKU checkout ready' : 'DOKU configured, waiting for checkout') : 'DOKU enabled but credentials missing')
    : 'DOKU checkout disabled';

  const agents = [
    { role: 'Sponsor Agent', side: 'sponsor', agentId: firstDefined(theater.sponsor?.agentId, sponsorMandate.agentId, 'not registered in current run'), wallet: firstDefined(theater.sponsor?.wallet, sponsorMandate.wallet, 'n/a'), score: sponsorScore, gate: 'Counterparty min score ' + (sponsorMandate.mandate?.minReputationScore ?? 'n/a'), action: theater.intent?.txHash ? 'broadcast ' + short(theater.intent.txHash) : 'waiting for intent' },
    { role: 'Community Agent', side: 'community', agentId: firstDefined(theater.community?.agentId, communityMandate.agentId, 'not registered in current run'), wallet: firstDefined(theater.community?.wallet, communityMandate.wallet, 'n/a'), score: communityScore, gate: 'Sponsor min score ' + (communityMandate.mandate?.minSponsorScore ?? 'n/a'), action: theater.delivery?.deliveryProof ? 'delivered ' + short(theater.delivery.deliveryProof) : 'waiting for delivery' },
  ];

  $('#registry-status').textContent = status + ' | ' + (theater.mode || data?.runState?.mode || 'no run selected');
  $('#registry-agent-grid').innerHTML = agents.map((agent) => [
    '<article class="registry-card ' + agent.side + '">',
    '<div class="registry-card-head">',
    '<span class="label">' + escapeHtml(agent.role) + '</span>',
    '<strong>' + escapeHtml(agent.score === undefined ? 'score n/a' : 'score ' + agent.score) + '</strong>',
    '</div>',
    '<dl>',
    '<div><dt>ERC-8004 ID</dt><dd>' + escapeHtml(agent.agentId) + '</dd></div>',
    '<div><dt>Owner wallet</dt><dd title="' + escapeHtml(agent.wallet) + '">' + escapeHtml(short(agent.wallet)) + '</dd></div>',
    '<div><dt>Trust gate</dt><dd>' + escapeHtml(agent.gate) + '</dd></div>',
    '<div><dt>Latest action</dt><dd>' + escapeHtml(agent.action) + '</dd></div>',
    '</dl>',
    '</article>',
  ].join('')).join('');

  const evidence = [
    ['Identity registry', chain.intentRegistry || 'current theater local registry'],
    ['Escrow contract', chain.escrowContract || theater.escrow?.txHash || 'not funded yet'],
    ['Intent tx', theater.intent?.txHash || latestPayment?.txHashes?.[0] || 'n/a'],
    ['Escrow tx', theater.escrow?.txHash || latestPayment?.txHashes?.[1] || 'n/a'],
    ['Delivery proof', theater.delivery?.deliveryProof || 'n/a'],
    ['Delivery tx', theater.delivery?.txHash || latestPayment?.txHashes?.[2] || 'n/a'],
    ['Proof hash', theater.proof?.proofHash || latestPayment?.proofHash || latestProof?.finalHash || 'n/a'],
    ['Payment receipt', theater.proof?.receiptId || latestPayment?.receiptId || 'n/a'],
    ['Memory layer', mem9State],
    ['Mem9 stored deals', mem9.storedCount === undefined ? 'n/a' : String(mem9.storedCount)],
    ['DOKU rail', dokuState],
    ['DOKU invoice', doku.lastInvoiceNumber || 'n/a'],
  ];
  const chainLabel = chain.name ? chain.name + (chain.chainId ? ' / chain ' + chain.chainId : '') : 'Local ERC-8004-compatible protocol chain';
  $('#registry-source').textContent = chainLabel + ' | ' + mem9State;
  $('#registry-evidence-grid').innerHTML = evidence.map(([label, value]) => [
    '<article class="evidence-tile">',
    '<span class="label">' + escapeHtml(label) + '</span>',
    '<strong title="' + escapeHtml(value) + '">' + escapeHtml(short(value)) + '</strong>',
    '</article>',
  ].join('')).join('');
}
function renderMandates(mandates) {
  const sponsor = mandates?.sponsor?.mandate || {};
  const community = mandates?.community?.mandate || {};
  setInputValue('#sponsor-campaign', sponsor.campaignName || '');
  setInputValue('#sponsor-budget', sponsor.budgetUsdc ?? 400);
  setInputValue('#sponsor-max-price', sponsor.maxPricePerPostUsdc ?? 40);
  setInputValue('#sponsor-min-members', sponsor.minMemberCount ?? 300);
  setInputValue('#sponsor-min-score', sponsor.minReputationScore ?? 70);
  setInputValue('#sponsor-ad-copy', sponsor.adCopy || '');
  setInputValue('#sponsor-policy', sponsor.contentPolicy || '');
  setInputValue('#community-platform', community.platform || 'discord');
  setInputValue('#community-members', community.memberCount ?? 847);
  setInputValue('#community-floor', community.priceFloorUsdc ?? 25);
  setInputValue('#community-min-score', community.minSponsorScore ?? 70);
  setInputValue('#community-max-ads', community.maxAdsPerDay ?? 3);
  setInputValue('#community-rules', Array.isArray(community.contentRules) ? community.contentRules.join('; ') : '');
  setInputValue('#community-guild', community.guildId || 'local-guild');
  setInputValue('#community-channel', community.channelId || 'local-channel');
}

function renderIntake() {
  $('#sponsor-intake-log').innerHTML = intakeState.sponsor.messages.map(renderMessage).join('');
  $('#community-intake-log').innerHTML = intakeState.community.messages.map(renderMessage).join('');
  $('#sponsor-intake-log').scrollTop = $('#sponsor-intake-log').scrollHeight;
  $('#community-intake-log').scrollTop = $('#community-intake-log').scrollHeight;
}

function setInputValue(selector, value) {
  const field = $(selector);
  if (!field || document.activeElement === field) return;
  field.value = value ?? '';
}

function readMandateForm() {
  return {
    sponsor: {
      campaignName: $('#sponsor-campaign').value,
      budgetUsdc: Number($('#sponsor-budget').value),
      maxPricePerPostUsdc: Number($('#sponsor-max-price').value),
      minMemberCount: Number($('#sponsor-min-members').value),
      minReputationScore: Number($('#sponsor-min-score').value),
      adCopy: $('#sponsor-ad-copy').value,
      contentPolicy: $('#sponsor-policy').value,
    },
    community: {
      platform: $('#community-platform').value,
      memberCount: Number($('#community-members').value),
      priceFloorUsdc: Number($('#community-floor').value),
      minSponsorScore: Number($('#community-min-score').value),
      maxAdsPerDay: Number($('#community-max-ads').value),
      contentRulesText: $('#community-rules').value,
      guildId: $('#community-guild').value,
      channelId: $('#community-channel').value,
    },
  };
}

async function sendIntake(role) {
  const input = $(`#${role}-intake-input`);
  const text = input.value.trim();
  if (!text) return;
  const state = intakeState[role];
  state.messages.push(['user', text]);
  state.messages.push(['agent', 'Reading your message with LLM...']);
  renderIntake();
  try {
    const response = await fetch('/api/intake', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role, text }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'LLM intake failed');
    state.messages.pop();
    state.parsed = normalizeLlmIntake(role, data.parsed);
    applyParsedMandate(role, state.parsed);
    state.messages.push(['agent', `${data.reply || intakeResponse(role, state.parsed, text)}\n\nsource: ${data.source}/${data.model}`]);
  } catch (error) {
    state.messages.pop();
    state.parsed = role === 'sponsor' ? parseSponsorIntake(text, state.parsed) : parseCommunityIntake(text, state.parsed);
    state.parsed.source = 'fallback-parser';
    applyParsedMandate(role, state.parsed);
    state.messages.push(['agent', `${intakeResponse(role, state.parsed, text)}\n\nsource: fallback parser because LLM intake failed: ${error.message}`]);
  }
  renderIntake();
}

async function saveChatMandates() {
  await sendIntakeIfDirty('sponsor');
  await sendIntakeIfDirty('community');
  await saveMandates();
}

async function sendIntakeIfDirty(role) {
  const input = $(`#${role}-intake-input`);
  const text = input.value.trim();
  const lastUser = [...intakeState[role].messages].reverse().find(([kind]) => kind === 'user')?.[1];
  if (text && text !== lastUser) await sendIntake(role);
}

function normalizeLlmIntake(role, parsed = {}) {
  const fallback = role === 'sponsor' ? parseSponsorIntake('') : parseCommunityIntake('');
  if (role === 'sponsor') {
    return {
      campaignName: parsed.campaignName || fallback.campaignName,
      budgetUsdc: parsed.budgetUsdc ?? fallback.budgetUsdc,
      maxPricePerPostUsdc: parsed.maxPricePerPostUsdc ?? fallback.maxPricePerPostUsdc,
      minMemberCount: parsed.minMemberCount ?? fallback.minMemberCount,
      minReputationScore: parsed.minReputationScore ?? fallback.minReputationScore,
      contentPolicy: parsed.contentPolicy || fallback.contentPolicy,
      adCopy: parsed.adCopy || fallback.adCopy,
      missingCritical: Array.isArray(parsed.missingCritical) ? parsed.missingCritical : [],
      source: 'glm',
    };
  }
  return {
    platform: parsed.platform === 'telegram' ? 'telegram' : 'discord',
    memberCount: parsed.memberCount ?? fallback.memberCount,
    priceFloorUsdc: parsed.priceFloorUsdc ?? fallback.priceFloorUsdc,
    minSponsorScore: parsed.minSponsorScore ?? fallback.minSponsorScore,
    maxAdsPerDay: parsed.maxAdsPerDay ?? fallback.maxAdsPerDay,
    contentRulesText: parsed.contentRulesText || fallback.contentRulesText,
    guildId: parsed.guildId || fallback.guildId,
    channelId: parsed.channelId || fallback.channelId,
    missingCritical: Array.isArray(parsed.missingCritical) ? parsed.missingCritical : [],
    source: 'glm',
  };
}

function parseSponsorIntake(text, previous = {}) {
  const money = moneyAmounts(text);
  const maxPrice = numberNear(text, /(max(?:imum)?|cap|ceiling)[^\d$]{0,24}\$?\s*(\d+(?:\.\d+)?)/i)
    ?? numberNear(text, /\$?\s*(\d+(?:\.\d+)?)\s*(?:usdc)?\s*(?:per post|\/post)/i);
  const budget = numberNear(text, /budget[^\d$]{0,24}\$?\s*(\d+(?:\.\d+)?)/i);
  const followUpAmount = money.length === 1 ? money[0] : null;
  const inferredBudget = budget ?? (previous.missingCritical?.includes('total budget') ? followUpAmount : null);
  const inferredMaxPrice = maxPrice ?? (
    previous.missingCritical?.length === 1 && previous.missingCritical.includes('max price per post')
      ? followUpAmount
      : null
  );
  const budgetUsdc = inferredBudget ?? previous.budgetUsdc ?? Number($('#sponsor-budget').value || 400);
  const maxPricePerPostUsdc = inferredMaxPrice ?? previous.maxPricePerPostUsdc ?? Number($('#sponsor-max-price').value || 40);
  const missingCritical = [
    !inferredBudget && !previous.budgetUsdc ? 'total budget' : null,
    !inferredMaxPrice && !previous.maxPricePerPostUsdc ? 'max price per post' : null,
  ].filter(Boolean);
  return {
    campaignName: phraseAfter(text, /campaign(?: name)?[:\s]+([^.;\n]+)/i) || previous.campaignName || 'OpenClaw Sponsor Campaign',
    budgetUsdc,
    maxPricePerPostUsdc,
    minMemberCount: numberNear(text, /(?:minimum|min|at least)[^\d]{0,20}(\d+)\s*(?:members|people|users)/i) ?? previous.minMemberCount ?? Number($('#sponsor-min-members').value || 300),
    minReputationScore: numberNear(text, /(?:score|reputation)[^\d]{0,20}(\d+)/i) ?? previous.minReputationScore ?? Number($('#sponsor-min-score').value || 70),
    contentPolicy: hasPolicySignal(text) ? extractPolicy(text) : previous.contentPolicy ?? extractPolicy(text),
    adCopy: phraseAfter(text, /ad copy[:\s]+(.+)$/i) || previous.adCopy || $('#sponsor-ad-copy').value || text,
    missingCritical,
  };
}

function parseCommunityIntake(text, previous = {}) {
  const money = moneyAmounts(text);
  const floor = numberNear(text, /(?:floor|minimum price|min price|price)[^\d$]{0,24}\$?\s*(\d+(?:\.\d+)?)/i);
  const followUpAmount = money.length === 1 ? money[0] : null;
  const inferredFloor = floor ?? (previous.missingCritical?.includes('price floor') ? followUpAmount : null);
  const priceFloorUsdc = inferredFloor ?? previous.priceFloorUsdc ?? Number($('#community-floor').value || 25);
  return {
    platform: /telegram/i.test(text) ? 'telegram' : previous.platform || 'discord',
    memberCount: numberNear(text, /(\d+)\s*(?:members|people|users)/i) ?? previous.memberCount ?? Number($('#community-members').value || 847),
    priceFloorUsdc,
    minSponsorScore: numberNear(text, /(?:sponsor score|score|reputation)[^\d]{0,20}(\d+)/i) ?? previous.minSponsorScore ?? Number($('#community-min-score').value || 70),
    maxAdsPerDay: numberNear(text, /max[^\d]{0,16}(\d+)\s*ads?/i) ?? previous.maxAdsPerDay ?? Number($('#community-max-ads').value || 3),
    contentRulesText: hasPolicySignal(text) ? extractPolicy(text) : previous.contentRulesText ?? extractPolicy(text),
    guildId: previous.guildId || $('#community-guild').value || 'local-guild',
    channelId: previous.channelId || $('#community-channel').value || 'local-channel',
    missingCritical: [
      !inferredFloor && !previous.priceFloorUsdc ? 'price floor' : null,
    ].filter(Boolean),
  };
}

function applyParsedMandate(role, parsed) {
  if (role === 'sponsor') {
    setField('#sponsor-campaign', parsed.campaignName);
    setField('#sponsor-budget', parsed.budgetUsdc);
    setField('#sponsor-max-price', parsed.maxPricePerPostUsdc);
    setField('#sponsor-min-members', parsed.minMemberCount);
    setField('#sponsor-min-score', parsed.minReputationScore);
    setField('#sponsor-ad-copy', parsed.adCopy);
    setField('#sponsor-policy', parsed.contentPolicy);
  } else {
    setField('#community-platform', parsed.platform);
    setField('#community-members', parsed.memberCount);
    setField('#community-floor', parsed.priceFloorUsdc);
    setField('#community-min-score', parsed.minSponsorScore);
    setField('#community-max-ads', parsed.maxAdsPerDay);
    setField('#community-rules', parsed.contentRulesText);
    setField('#community-guild', parsed.guildId);
    setField('#community-channel', parsed.channelId);
  }
}

function intakeResponse(role, parsed, originalText = '') {
  if (parsed.missingCritical?.length) {
    if (role === 'sponsor' && parsed.budgetUsdc && parsed.missingCritical.includes('max price per post')) {
      return `I’ll treat ${money(parsed.budgetUsdc)} as the total budget. What is the most I can pay per post?`;
    }
    return `I can infer the rest, but I need one critical detail before I can safely act: ${parsed.missingCritical.join(', ')}. Reply with that, or keep the current default shown in the setup card.`;
  }
  if (role === 'sponsor') {
    return `Got it. I captured a usable sponsor mandate from your prompt: budget ${money(parsed.budgetUsdc)}, max ${money(parsed.maxPricePerPostUsdc)} per post, audience >= ${parsed.minMemberCount}, score >= ${parsed.minReputationScore}. I will now wait for a qualified community agent; reputation and settlement receipts decide future terms.`;
  }
  return `Got it. I captured a usable community mandate from your prompt: ${parsed.platform}, ${parsed.memberCount} members, floor ${money(parsed.priceFloorUsdc)}, sponsor score >= ${parsed.minSponsorScore}, max ${parsed.maxAdsPerDay} ads/day. I will wait, reject unsafe ads, and only accept offers that clear your floor.`;
}

function numberNear(text, pattern) {
  const match = text.match(pattern);
  return match ? Number(match[match.length - 1]) : null;
}

function moneyAmounts(text) {
  return [...String(text).matchAll(/(?:\$|usd|usdc|dollars?)?\s*(\d+(?:\.\d+)?)\s*(?:usd|usdc|dollars?)?/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));
}

function phraseAfter(text, pattern) {
  return text.match(pattern)?.[1]?.trim();
}

function extractPolicy(text) {
  const rules = [];
  const lower = text.toLowerCase();
  for (const phrase of ['no gambling', 'no scams', 'no adult content', 'no guaranteed returns', 'ai infra only', 'web3 only']) {
    if (lower.includes(phrase)) rules.push(phrase);
  }
  return rules.length ? rules.join('; ') : 'no gambling; no scams; no guaranteed returns';
}

function hasPolicySignal(text) {
  return /no |only|forbid|ban|gambling|scam|adult|guaranteed|web3|ai infra/i.test(text);
}

function setField(selector, value) {
  const field = $(selector);
  if (field) field.value = value ?? '';
}

async function saveMandates() {
  const button = $('#save-mandates');
  const status = $('#mandate-save-status');
  button.disabled = true;
  status.textContent = 'Menyimpan mandate untuk kedua agent...';
  try {
    const response = await fetch('/api/mandates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(readMandateForm()),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Failed to save mandates');
    status.textContent = 'Mandate tersimpan. Agent run berikutnya akan memakai budget, floor, score, dan content rules ini.';
    await loadCockpit();
  } catch (error) {
    status.textContent = `Mandate gagal disimpan: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

function renderRunState(runState, theater, badcase) {
  if (!runState) {
    renderLiveReplay(null);
    $('#run-log').textContent = 'Belum ada protocol run dari workspace ini.';
    $('#openclaw-result').innerHTML = `
      <span class="label">Agent Result</span>
      <strong>Menunggu orchestration evidence.</strong>
      <p>Mulai alur sponsorship untuk merekam agent action, tool call, settlement, dan proof.</p>
    `;
    return;
  }
  const header = [
    `status=${runState.status}`,
    `mode=${runState.mode || 'agenthon-local'}`,
    runState.exitCode !== null && runState.exitCode !== undefined ? `exit=${runState.exitCode}` : '',
  ].filter(Boolean).join(' | ');
  $('#run-log').textContent = `${header}\n\n${(runState.logs || []).join('\n')}`;
  $('#run-log').scrollTop = $('#run-log').scrollHeight;
  renderLiveReplay(runState);
  const running = runState.status === 'running';
  $('#run-agenthon').disabled = running;
  $('#run-agenthon-discord').disabled = running;
  $('#run-openclaw-gemini').disabled = running;
  $('#run-openclaw-discord').disabled = running;
  $('#run-openclaw-duel').disabled = running;
  $('#run-two-agent-theater').disabled = running;
  $('#run-badcase').disabled = running;

  const theaterSnapshot = runState.theaterResult || theater;
  if (runState.mode === 'guardrail-rejection' && badcase) {
    $('#openclaw-result').innerHTML = `
      <span class="label">Guardrail Rejection Result</span>
      <strong>${escapeHtml(badcase.actualDecision || 'unknown')} | escrow not funded</strong>
      <p>${escapeHtml(badcase.reason || 'Community policy rejected the offer before payment moved.')}</p>
      <pre>${escapeHtml([
        `Scenario: ${badcase.scenario || 'malicious-content-rejection'}`,
        `Expected: ${badcase.expected || 'Reject before escrow'}`,
        `Proof: ${badcase.proofHash || 'n/a'}`,
      ].join('\n'))}</pre>
    `;
    return;
  }

  if (runState.mode?.startsWith('two-agent-theater') && theaterSnapshot?.events?.length) {
    const latest = theaterSnapshot.events[theaterSnapshot.events.length - 1];
    $('#openclaw-result').innerHTML = `
      <span class="label">Agent Sponsorship Result</span>
      <strong>${escapeHtml(theaterSnapshot.status || runState.status)} | escrow ${escapeHtml(theaterSnapshot.escrow?.id ?? 'n/a')} | ${money(theaterSnapshot.escrow?.amountUsdc)}</strong>
      <p>${escapeHtml(latest?.detail || 'SponsorAgent dan CommunityAgent menyelesaikan workflow yang bisa diaudit.')}</p>
      <pre>${escapeHtml([
        `Sponsor: ${theaterSnapshot.sponsor?.wallet || 'n/a'}`,
        `Community: ${theaterSnapshot.community?.wallet || 'n/a'}`,
        `Intent tx: ${theaterSnapshot.intent?.txHash || 'n/a'}`,
        `Escrow tx: ${theaterSnapshot.escrow?.txHash || 'n/a'}`,
        `Delivery: ${theaterSnapshot.delivery?.deliveryProof || 'n/a'}`,
        `Receipt: ${theaterSnapshot.proof?.receiptId || 'n/a'}`,
      ].join('\n'))}</pre>
    `;
    return;
  }

  const result = runState.openclawResult;
  if (result?.text) {
    const evidence = result.verifiedEvidence;
    const evidenceBlock = evidence ? `
      <div class="verified-evidence">
        <span class="label">Verified From Receipts</span>
        <strong>${escapeHtml(evidence.settlementStatus || 'unknown')} | Escrow ${escapeHtml(evidence.escrowId ?? 'n/a')} | ${money(evidence.amountUsdc)}</strong>
        <p>Receipt ${escapeHtml(short(evidence.receiptId || 'n/a'))} | Proof ${escapeHtml(short(evidence.proofHash || 'n/a'))} | ${evidence.txHashes?.length || 0} tx hash${evidence.txHashes?.length === 1 ? '' : 'es'}</p>
      </div>
    ` : '';
    $('#openclaw-result').innerHTML = `
      <span class="label">OpenClaw Orchestration Result</span>
      <strong>${escapeHtml(result.provider || 'provider')}/${escapeHtml(result.model || 'model')} | ${result.toolSummary?.calls || 0} tool call${result.toolSummary?.calls === 1 ? '' : 's'} | ${result.toolSummary?.failures || 0} failures</strong>
      ${evidenceBlock}
      <pre>${escapeHtml(result.text)}</pre>
    `;
  } else {
    $('#openclaw-result').innerHTML = `
      <span class="label">Agent Result</span>
      <strong>${escapeHtml(runState.model || runState.mode || 'Agent run')} | ${escapeHtml(runState.status || 'unknown')}</strong>
      <p>${running ? 'Agent orchestration sedang berjalan. Evidence akan muncul saat protocol bergerak.' : 'Belum ada final orchestration summary untuk run ini.'}</p>
    `;
  }
}

function renderLiveReplay(runState) {
  const replay = $('#live-replay');
  if (!replay) return;

  const events = parseRunEvents(runState);
  const modeInfo = demoModeInfo(runState?.mode);
  const latest = events[events.length - 1];
  const running = runState?.status === 'running';
  const completed = runState?.status === 'completed';
  const failed = runState?.status === 'failed';

  if (!runState || !events.length) {
    replay.className = 'live-replay';
    replay.innerHTML = `
      <div class="replay-head">
        <div>
          <span class="label">Agent Execution</span>
          <strong>Belum ada protocol event.</strong>
        </div>
        <p>Mulai alur sponsorship untuk melihat SponsorAgent, CommunityAgent, policy gates, escrow, dan payment progress dari event log.</p>
      </div>
      <div class="mode-cheatsheet">
        ${demoModes().map(renderModeCard).join('')}
      </div>
    `;
    return;
  }

  replay.className = `live-replay ${running ? 'is-running' : ''} ${completed ? 'is-complete' : ''} ${failed ? 'is-failed' : ''}`;
  replay.innerHTML = `
    <div class="replay-head">
      <div>
        <span class="label">Agent Execution</span>
        <strong>${escapeHtml(modeInfo.title)} ${running ? 'berjalan' : completed ? 'selesai' : failed ? 'gagal' : 'siap'}</strong>
      </div>
      <p>${escapeHtml(modeInfo.bestFor)}</p>
    </div>
    <div class="agent-lanes" aria-label="Live agent lanes">
      ${renderLane('Sponsor Agent', 'sponsor', events)}
      ${renderLane('System / Chain', 'system', events)}
      ${renderLane('Community Agent', 'community', events)}
      ${renderLane('OpenClaw', 'openclaw', events)}
    </div>
    <div class="packet-stage">
      <span class="packet-node sponsor-node">Sponsor</span>
      <span class="packet-line"></span>
      <span class="packet ${actorClass(latest?.actor)}">${escapeHtml(latest?.action || 'siap')}</span>
      <span class="packet-node community-node">Community</span>
    </div>
    <div class="event-film">
      ${events.slice(-10).map((event, index, list) => renderEventFrame(event, index === list.length - 1)).join('')}
    </div>
  `;
}

function renderLane(title, actor, events) {
  const count = events.filter((event) => event.actor === actor).length;
  const active = events[events.length - 1]?.actor === actor;
  return `
    <article class="agent-lane ${actorClass(actor)} ${active ? 'active' : ''}">
      <span>${escapeHtml(title)}</span>
      <strong>${count}</strong>
      <p>${active ? 'sedang aktif' : count ? 'ikut memproses' : 'menunggu'}</p>
    </article>
  `;
}

function renderEventFrame(event, active) {
  return `
    <article class="event-frame ${actorClass(event.actor)} ${active ? 'active' : ''}">
      <span>${escapeHtml(event.actorLabel)}</span>
      <strong>${escapeHtml(event.action)}</strong>
      <p>${escapeHtml(event.detail)}</p>
    </article>
  `;
}

function parseRunEvents(runState) {
  if (!runState?.logs?.length) return [];
  return runState.logs
    .flatMap((line) => eventFromLogLine(line))
    .slice(-24);
}

function eventFromLogLine(line) {
  const text = String(line || '').trim();
  if (!text) return [];
  const lowered = text.toLowerCase();
  const events = [];

  const theaterMatch = text.match(/^\[(SYSTEM|SPONSOR|COMMUNITY) POV\]\s+(.+)$/i);
  if (theaterMatch) {
    events.push(makeEvent(theaterMatch[1], prettyToolName(theaterMatch[2]), `Tool call: ${theaterMatch[2]}`));
    return events;
  }

  const openClawPovMatch = text.match(/^\[OpenClaw (SPONSOR|COMMUNITY) POV\]\s+(?:must call|openclaw)\s+(.+)$/i);
  if (openClawPovMatch) {
    events.push(makeEvent(openClawPovMatch[1], `OpenClaw calls ${prettyToolName(openClawPovMatch[2])}`, text));
    return events;
  }

  const openClawRoleMatch = text.match(/^\[OpenClaw (Sponsor|Community)\]\s+([^:]+):?\s*(.*)$/i);
  if (openClawRoleMatch) {
    const [, role, title, rest] = openClawRoleMatch;
    events.push(makeEvent(role, title, rest || title));
    return events;
  }

  const actorMatch = text.match(/^\[(SYSTEM|SPONSOR|COMMUNITY|SETTLEMENT|AgenthonLocal|Dashboard)\]\s+([^:]+):?\s*(.*)$/i);
  if (actorMatch) {
    const [, rawActor, title, rest] = actorMatch;
    events.push(makeEvent(rawActor, title, rest || title));
    return events;
  }

  if (lowered.includes('openclaw process started') || lowered.includes('launching: openclaw')) {
    events.push(makeEvent('openclaw', 'OpenClaw launched', text.replace(/^\[Dashboard\]\s*/, '')));
  } else if (lowered.includes('openclaw final summary')) {
    events.push(makeEvent('openclaw', 'Summary received', 'OpenClaw returned the agent-run result.'));
  } else if (lowered.includes('embedded run agent end')) {
    events.push(makeEvent('openclaw', lowered.includes('iserror=true') ? 'Provider retry' : 'Agent step', text));
  } else if (lowered.includes('intent broadcast')) {
    events.push(makeEvent('sponsor', 'Intent broadcast', text));
  } else if (lowered.includes('handshake')) {
    events.push(makeEvent('community', lowered.includes('rejected') ? 'Handshake rejected' : 'Handshake accepted', text));
  } else if (lowered.includes('round 1 offer') || lowered.includes('offer sent')) {
    events.push(makeEvent('sponsor', 'Offer sent', text));
  } else if (lowered.includes('decision') || lowered.includes('offer accept')) {
    events.push(makeEvent('community', lowered.includes('reject') ? 'Offer rejected' : 'Offer accepted', text));
  } else if (lowered.includes('escrow funded')) {
    events.push(makeEvent('sponsor', 'Escrow funded', text));
  } else if (lowered.includes('delivery proof') || lowered.includes('ad delivered')) {
    events.push(makeEvent('community', 'Delivery proof', text));
  } else if (lowered.includes('settled') || lowered.includes('settlement verified')) {
    events.push(makeEvent('sponsor', 'Settlement verified', text));
  }

  return events;
}

function makeEvent(actor, action, detail) {
  const normalized = normalizeActor(actor);
  return {
    actor: normalized,
    actorLabel: {
      sponsor: 'Sponsor Agent',
      community: 'Community Agent',
      system: 'System / Chain',
      openclaw: 'OpenClaw',
    }[normalized] || 'System',
    action: String(action || 'Event').replace(/^adsourcing_/, '').replace(/_/g, ' '),
    detail: String(detail || '').replace(/\s+/g, ' ').slice(0, 180),
  };
}

function normalizeActor(actor = '') {
  const value = String(actor).toLowerCase();
  if (value.includes('sponsor')) return 'sponsor';
  if (value.includes('community')) return 'community';
  if (value.includes('openclaw') || value.includes('agent/embedded')) return 'openclaw';
  return 'system';
}

function actorClass(actor = '') {
  return `actor-${normalizeActor(actor)}`;
}

function prettyToolName(toolName = '') {
  return String(toolName)
    .replace(/^adsourcing_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function demoModes() {
  return [
    ['Sponsorship Flow', 'Primary path', 'Menampilkan aksi autonomous agent dari mandate sampai receipt.'],
    ['OpenClaw Orchestration', 'Tool proof', 'Dua role OpenClaw menjalankan tool sponsor dan komunitas.'],
    ['Policy Rejection', 'Risk proof', 'Menunjukkan sponsorship berisiko dihentikan sebelum dana bergerak.'],
    ['OpenClaw + GLM', 'Agent runtime', 'OpenClaw/GLM memanggil tool dan merangkum receipt.'],
    ['GLM + Discord', 'Delivery proof', 'Menggunakan Discord API delivery saat env tersedia.'],
    ['Local Protocol Stack', 'Technical review', 'Contract, escrow, proof, dan payment receipt.'],
    ['Protocol + Discord', 'Integrated path', 'Protocol service stack dengan Discord bot delivery.'],
  ];
}

function demoModeInfo(mode = '') {
  const normalized = String(mode || '');
  if (normalized.startsWith('openclaw-duel')) {
    return { title: 'OpenClaw Orchestration', bestFor: 'Sponsor dan Community session menjalankan protocol tools secara bergantian.' };
  }
  if (normalized.startsWith('two-agent-theater')) {
    return { title: 'Sponsorship Flow', bestFor: 'Dua agent terlihat sebagai aktor transaksi: identity, negotiation, escrow, delivery, dan payment.' };
  }
  if (normalized === 'guardrail-rejection') {
    return { title: 'Policy Rejection', bestFor: 'Membuktikan agent punya batasan dan tidak mendanai sponsorship berisiko.' };
  }
  if (normalized.startsWith('openclaw-llm') || normalized.startsWith('openclaw-gemini')) {
    return { title: normalized.includes('discord') ? 'GLM + Discord' : 'OpenClaw + GLM', bestFor: 'Membuktikan turn LLM OpenClaw menjalankan AdSourcing protocol tool.' };
  }
  if (normalized.includes('discord')) {
    return { title: 'Protocol + Discord', bestFor: 'Dipakai saat Discord bot env tersedia dan real delivery ingin terlihat di layar.' };
  }
  if (normalized.includes('local')) {
    return { title: 'Local Protocol Stack', bestFor: 'Local chain, contract, escrow, proof, dan receipt untuk review teknikal.' };
  }
  return { title: 'AdSourcing Protocol', bestFor: 'Sponsorship Flow untuk cerita produk, OpenClaw untuk agent proof, Local Protocol Stack untuk review teknikal.' };
}

function renderModeCard([title, tag, detail]) {
  return `
    <article>
      <span>${escapeHtml(tag)}</span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(detail)}</p>
    </article>
  `;
}

function renderNarrative(narrative) {
  if (!narrative) return;
  $('#narrative-headline').textContent = localNarrativeHeadline(narrative.headline);
  $('#narrative-mode').textContent = cockpitData?.runState?.mode || 'agent evidence';

  $('#story-sponsor').textContent = narrative.sponsor?.wallet ? short(narrative.sponsor.wallet) : 'Sponsor Agent';
  $('#story-sponsor-detail').textContent = `Offer ${money(narrative.sponsor?.offerUsdc)} masih di bawah max budget ${money(narrative.sponsor?.maxBudgetUsdc)}.`;

  $('#story-community').textContent = narrative.community?.wallet ? short(narrative.community.wallet) : 'Community Agent';
  $('#story-community-detail').textContent = `Floor ${money(narrative.community?.floorUsdc)}; decision ${narrative.community?.decision || 'pending'}.`;

  $('#story-escrow').textContent = narrative.escrow?.status || 'Menunggu';
  $('#story-escrow-detail').textContent = `Amount ${money(narrative.escrow?.amountUsdc)}; payout ${money(narrative.escrow?.communityPayoutUsdc)}; fee ${money(narrative.escrow?.protocolFeeUsdc)}.`;

  $('#story-proof').textContent = narrative.proof?.proofHash ? short(narrative.proof.proofHash) : short(narrative.proof?.receiptId || 'Belum ada receipt');
  $('#story-proof-detail').textContent = narrative.proof?.deliveryProof
    ? `Delivery ${narrative.proof.deliveryProof}.`
    : 'Proof bundle dan payment receipt muncul setelah payment selesai.';
}

function localNarrativeHeadline(headline = '') {
  const normalized = String(headline).toLowerCase();
  if (normalized.includes('sponsor paid') || normalized.includes('escrow settled')) {
    return 'Sponsor membayar, komunitas mengirim proof, escrow selesai.';
  }
  if (normalized.includes('no completed')) return 'Belum ada transaksi selesai.';
  return headline || 'Belum ada transaksi selesai.';
}

function renderPov(narrative, runState, theater) {
  const mode = theater?.status ? `theater:${theater.status}` : (runState?.mode || 'agent-ready');
  $('#pov-mode').textContent = mode;
  if (theater?.events?.length) {
    const sponsorEvents = theater.events.filter((event) => event.actor === 'sponsor');
    const communityEvents = theater.events.filter((event) => event.actor === 'community');
    $('#sponsor-pov').innerHTML = [
      ['user', `Mandate: beli placement komunitas yang lolos kualifikasi. Max spend ${money(theater.sponsor?.maxPriceUsdc)}.`],
      ...sponsorEvents.map((event) => ['agent', `${event.title}: ${event.detail}`]),
      theater.escrow ? ['counterparty', `Escrow ${theater.escrow.id}: ${money(theater.escrow.amountUsdc)} ${theater.escrow.settled ? 'selesai' : 'terkunci'}.`] : null,
    ].filter(Boolean).map(renderMessage).join('');
    $('#community-pov').innerHTML = [
      ['user', `Mandate: jual satu slot aman di atas ${money(theater.community?.floorUsdc)}.`],
      ...communityEvents.map((event) => ['agent', `${event.title}: ${event.detail}`]),
      theater.delivery ? ['counterparty', `Delivery proof: ${theater.delivery.deliveryProof}.`] : null,
    ].filter(Boolean).map(renderMessage).join('');
    return;
  }

  const offer = money(narrative?.sponsor?.offerUsdc);
  const maxBudget = money(narrative?.sponsor?.maxBudgetUsdc);
  const floor = money(narrative?.community?.floorUsdc);
  const status = narrative?.escrow?.status || 'PENDING';
  const payout = money(narrative?.escrow?.communityPayoutUsdc);
  const fee = money(narrative?.escrow?.protocolFeeUsdc);
  const receipt = narrative?.proof?.receiptId || runState?.openclawResult?.text?.match(/Receipt ID:\*\* `([^`]+)`/)?.[1];
  const proof = narrative?.proof?.proofHash || runState?.openclawResult?.text?.match(/Proof ID:\*\* `([^`]+)`/)?.[1];

  $('#sponsor-pov').innerHTML = [
    ['user', `Mandate: cari komunitas di atas 300 member. Max spend ${maxBudget}.`],
    ['agent', `Community score, inventory, dan policy sudah diverifikasi. Offer terkirim ${offer}.`],
    ['counterparty', `Community menerima karena offer melewati floor dan content rules.`],
    ['agent', `Escrow status: ${status}. Receipt ${short(receipt || 'pending')}.`],
  ].map(renderMessage).join('');

  $('#community-pov').innerHTML = [
    ['user', `Mandate: terima sponsor post yang aman di atas ${floor}.`],
    ['agent', `Sponsor signature, ERC-8004 wallet binding, score, dan daily inventory sudah dicek.`],
    ['counterparty', `Sponsor mengunci dana di escrow sebelum delivery.`],
    ['agent', `Payout ${payout}; protocol fee ${fee}; proof ${short(proof || 'pending')}.`],
  ].map(renderMessage).join('');
}

function renderFlowBoard(data) {
  const theater = data?.theater || {};
  const narrative = data?.narrative || {};
  const mandates = data?.mandates || {};
  const sponsorMandate = mandates.sponsor?.mandate || {};
  const communityMandate = mandates.community?.mandate || {};
  const logPhase = phaseFromRunLogs(data?.runState);
  const currentPhase = logPhase || theaterPhase(theater.status) || activeDeal?.phase || data?.proofs?.[0]?.phase || 'DISCOVERED';
  const currentIndex = Math.max(0, phases.indexOf(currentPhase));
  const isRunning = data?.runState?.status === 'running';
  const isRejected = data?.runState?.mode === 'guardrail-rejection' && data?.badcase?.actualDecision === 'REJECT';
  const offer = theater.offer?.offeredPriceUsdc ?? narrative.sponsor?.offerUsdc;
  const escrow = theater.escrow || narrative.escrow || {};
  const proof = theater.proof || narrative.proof || {};
  const handshake = theater.handshake || {};
  const sponsorName = sponsorDisplayName(data, theater);
  const communityName = communityDisplayName(data, theater);
  const sponsorWallet = theater.sponsor?.wallet || narrative.sponsor?.wallet || mandates.sponsor?.wallet;
  const communityWallet = theater.community?.wallet || narrative.community?.wallet || mandates.community?.wallet;
  const sponsorAgentId = theater.sponsor?.agentId || mandates.sponsor?.agentId;
  const communityAgentId = theater.community?.agentId || mandates.community?.agentId;
  const adCopy = sponsoredPostCopy(sponsorMandate.adCopy);
  const deliveryProof = theater.delivery?.deliveryProof || narrative.proof?.deliveryProof || 'delivery proof pending';

  const progressPercent = phases.length > 1 ? Math.round((currentIndex / (phases.length - 1)) * 100) : 0;
  const motionLabel = isRejected
    ? 'Policy menghentikan sponsorship sebelum dana masuk escrow.'
    : isRunning
      ? `Agent sedang menjalankan tahap ${phaseStories[currentPhase]?.title || currentPhase}.`
      : currentPhase === 'SETTLED'
        ? 'Payment selesai setelah delivery proof diterima.'
        : `Alur berhenti di tahap ${phaseStories[currentPhase]?.title || currentPhase}.`;

  $('#flow-motion').className = `flow-motion ${isRunning ? 'running' : ''} ${isRejected ? 'rejected' : ''}`;
  $('#flow-motion').style.setProperty('--flow-progress', `${progressPercent}%`);
  $('#flow-motion').innerHTML = `
    <div class="motion-track">
      <span class="motion-fill"></span>
      <span class="motion-pulse"></span>
    </div>
    <div class="motion-copy">
      <strong>${escapeHtml(isRejected ? 'Ditahan sebelum escrow' : currentPhase === 'SETTLED' ? 'Payment selesai setelah proof' : currentPhase.replace('_', ' '))}</strong>
      <span>${escapeHtml(motionLabel)}</span>
    </div>
  `;

  $('#flow-sponsor-title').textContent = sponsorName;
  $('#flow-sponsor-detail').innerHTML = [
    'SponsorAgent menjaga budget, max price, dan brand safety.',
    `<span class="entity-meta">Wallet ${escapeHtml(short(sponsorWallet || 'waiting'))}${sponsorAgentId ? ` · Agent ID ${escapeHtml(String(sponsorAgentId))}` : ''}</span>`,
  ].join('');
  $('#flow-sponsor-facts').innerHTML = renderFacts([
    ['Max price', money(theater.sponsor?.maxPriceUsdc ?? sponsorMandate.maxPricePerPostUsdc ?? narrative.sponsor?.maxBudgetUsdc)],
    ['Offer', money(offer)],
    ['Sponsor score', handshake.sponsorScore ?? '78'],
  ]);

  $('#flow-community-title').textContent = communityName;
  $('#flow-community-detail').innerHTML = [
    'CommunityAgent menjaga floor price, content rules, dan delivery slot.',
    `<span class="entity-meta">Wallet ${escapeHtml(short(communityWallet || 'waiting'))}${communityAgentId ? ` · Agent ID ${escapeHtml(String(communityAgentId))}` : ''}</span>`,
  ].join('');
  $('#flow-community-facts').innerHTML = renderFacts([
    ['Floor price', money(theater.community?.floorUsdc ?? communityMandate.priceFloorUsdc ?? narrative.community?.floorUsdc)],
    ['Platform', theater.community?.platform || 'discord'],
    ['Community score', handshake.communityScore ?? '82'],
  ]);

  $('#flow-route').innerHTML = [
    {
      label: 'Identity',
      title: handshake.accepted ? 'Identity verified' : 'Menunggu handshake',
      body: handshake.accepted
        ? `Wallet dan signature cocok dengan ERC-8004 binding. Score ${handshake.sponsorScore}.`
        : 'Agent harus lolos identity dan reputation gate sebelum negosiasi.',
    },
    {
      label: 'Payment',
      title: escrow.id !== undefined ? `${money(escrow.amountUsdc)} terkunci` : 'Escrow belum funded',
      body: escrow.id !== undefined
        ? `Escrow funded sebelum delivery. Payout komunitas ${money(narrative.escrow?.communityPayoutUsdc)}.`
        : 'Sponsor tidak mendapat delivery sebelum payment terkunci.',
    },
    {
      label: 'Proof',
      title: proof.receiptId ? 'Receipt tercatat' : 'Proof pending',
      body: proof.receiptId
        ? `Delivery proof tercatat ke ${short(proof.receiptId)}.`
        : 'Proof bundle dan payment receipt muncul setelah delivery diverifikasi.',
    },
    {
      label: 'Sponsored Post Preview',
      title: communityName,
      body: `${adCopy.slice(0, 92)}${adCopy.length > 92 ? '...' : ''} · Proof ${short(deliveryProof)}`,
      preview: true,
    },
  ].map((item) => `
    <article class="route-card ${item.preview ? 'sponsored-preview' : ''}">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.body)}</p>
    </article>
  `).join('');

  const stepRows = [
    ['DISCOVERED', 'Sponsor', 'Intent broadcast', 'Budget, audience floor, dan ad policy ditandatangani.', theater.intent?.txHash || activeDeal?.txHashes?.[0] || 'waiting'],
    ['HANDSHAKE_VERIFIED', 'Community', 'Identity gate', 'Wallet, signature, score, dan inventory lolos.', handshake.accepted ? `score ${handshake.sponsorScore}` : 'waiting'],
    ['NEGOTIATING', 'Sponsor', `Offer ${money(offer)}`, 'SponsorAgent tetap di dalam max-price mandate.', theater.offer?.signature || 'waiting'],
    ['AGREED', 'Community', theater.response?.type ? `Decision ${theater.response.type}` : 'Terms decision', 'Floor price dan content policy menerima offer.', theater.response?.signature || 'waiting'],
    ['ESCROW_FUNDED', 'Sponsor', escrow.id !== undefined ? `Escrow ${escrow.id}` : 'Escrow funding', 'Payment terkunci sebelum delivery.', escrow.txHash || 'waiting'],
    ['DELIVERED', 'Community', 'Ad delivered', 'Community mengirim sponsored post dan delivery proof.', theater.delivery?.deliveryProof || narrative.proof?.deliveryProof || 'waiting'],
    ['SETTLED', 'Sponsor', 'Payment receipt', 'Sponsor memverifikasi delivery; payout dan receipt final.', proof.receiptId || proof.proofHash || 'waiting'],
  ];

  $('#flow-steps').innerHTML = stepRows.map(([phase, actor, title, body, evidence], index) => {
    const state = `${index < currentIndex ? 'complete' : ''} ${index === currentIndex ? 'current complete pulsing' : ''} ${isRejected && index >= 4 ? 'blocked' : ''}`;
    return `
      <button class="flow-step ${state}" data-phase="${phase}" type="button">
        <span class="step-top">
          <span class="step-index">${index + 1}</span>
          <span class="step-actor">${escapeHtml(actor)}</span>
        </span>
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(body)}</p>
        <span class="step-evidence">${escapeHtml(short(evidence))}</span>
      </button>
    `;
  }).join('');

  $$('.flow-step').forEach((button) => button.addEventListener('click', () => selectPhase(button.dataset.phase)));
}

function phaseFromRunLogs(runState) {
  if (!runState || runState.status !== 'running') return null;
  const logs = (runState.logs || []).join('\n');
  const tests = [
    ['SETTLED', /settlement verified|theater completed|settled/i],
    ['DELIVERED', /ad delivered|community_deliver|delivery proof/i],
    ['ESCROW_FUNDED', /escrow funded|sponsor_fund|locked \$|funded escrow/i],
    ['AGREED', /offer accept|decision: ACCEPT|community_decide/i],
    ['NEGOTIATING', /offer sent|sponsor_offer|round 1 offer/i],
    ['HANDSHAKE_VERIFIED', /handshake accepted|community_handshake/i],
    ['DISCOVERED', /intent broadcast|sponsor_broadcast|theater initialized/i],
  ];
  return tests.find(([, pattern]) => pattern.test(logs))?.[0] || null;
}

function renderFacts(rows) {
  return rows.map(([label, value]) => `
    <div class="fact">
      <span>${escapeHtml(label)}</span>
      <strong title="${escapeHtml(value)}">${escapeHtml(value)}</strong>
    </div>
  `).join('');
}

function theaterPhase(status) {
  const map = {
    ready: 'DISCOVERED',
    discovered: 'DISCOVERED',
    handshake: 'HANDSHAKE_VERIFIED',
    negotiating: 'NEGOTIATING',
    agreed: 'AGREED',
    funded: 'ESCROW_FUNDED',
    settled: 'SETTLED',
  };
  return map[status] || null;
}

function renderMessage([role, text]) {
  return `<div class="pov-message ${role}">
    <span>${role}</span>
    <p>${escapeHtml(text)}</p>
  </div>`;
}

function money(value) {
  return Number.isFinite(Number(value)) ? `$${Number(value).toFixed(2)}` : 'n/a';
}

async function startAgenthonRun(localDelivery) {
  const button = localDelivery ? $('#run-agenthon') : $('#run-agenthon-discord');
  button.disabled = true;
  try {
    const response = await fetch(`/api/run/agenthon-local?localDelivery=${localDelivery ? 'true' : 'false'}`, {
      method: 'POST',
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Failed to start run');
    await loadCockpit();
  } catch (error) {
    $('#run-log').textContent = `Could not start run: ${error.message}`;
    button.disabled = false;
  }
}

async function startOpenClawGeminiRun(localDelivery = true) {
  const button = localDelivery ? $('#run-openclaw-gemini') : $('#run-openclaw-discord');
  button.disabled = true;
  try {
    const response = await fetch(`/api/run/openclaw-gemini?localDelivery=${localDelivery ? 'true' : 'false'}&model=${encodeURIComponent(OPENCLAW_LLM_MODEL)}`, {
      method: 'POST',
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Failed to start OpenClaw run');
    await loadCockpit();
  } catch (error) {
    $('#run-log').textContent = `Could not start OpenClaw run: ${error.message}`;
    button.disabled = false;
  }
}

async function startOpenClawDuelRun(localDelivery = true) {
  const button = $('#run-openclaw-duel');
  button.disabled = true;
  try {
    const response = await fetch(`/api/run/openclaw-duel?localDelivery=${localDelivery ? 'true' : 'false'}&model=${encodeURIComponent(OPENCLAW_LLM_MODEL)}`, {
      method: 'POST',
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Failed to start OpenClaw duel');
    await loadCockpit();
  } catch (error) {
    $('#run-log').textContent = `Could not start OpenClaw duel: ${error.message}`;
    button.disabled = false;
  }
}

async function startTwoAgentTheater(localDelivery = true) {
  const button = $('#run-two-agent-theater');
  button.disabled = true;
  try {
    const response = await fetch(`/api/run/two-agent-theater?localDelivery=${localDelivery ? 'true' : 'false'}`, {
      method: 'POST',
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Failed to start two-agent theater');
    await loadCockpit();
  } catch (error) {
    $('#run-log').textContent = `Could not start two-agent theater: ${error.message}`;
    button.disabled = false;
  }
}

async function startBadCaseRun() {
  const button = $('#run-badcase');
  button.disabled = true;
  try {
    const response = await fetch('/api/run/badcase', { method: 'POST' });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Failed to start rejection case');
    await loadCockpit();
  } catch (error) {
    $('#run-log').textContent = `Could not start rejection case: ${error.message}`;
    button.disabled = false;
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderPhaseRail(phase) {
  $('#phase-rail').innerHTML = phases.map((item) => `
    <button class="phase-dot ${item === phase ? 'active' : ''} ${item === selectedPhase ? 'preview' : ''}" data-phase="${item}" type="button">${item.replace('_', ' ')}</button>
  `).join('');
  $$('.phase-dot').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    selectPhase(button.dataset.phase);
  }));
}

function setSelectedView(view) {
  selectedView = view;
  $$('.metric-button').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  $$('.inspector-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === view));
  const labels = {
    deal: ['Deal Transcript', 'Showing signed state transitions, wallets, current phase, and latest policy checks.'],
    policy: ['Policy Verdicts', 'Showing deterministic guardrails that constrained the agents before or after model reasoning.'],
    proof: ['Proof + Payment Receipt', 'Showing portable proof bundles plus escrow settlement and protocol-fee receipts.'],
    redteam: ['Adversarial Eval', 'Showing hostile scenarios the agent refused or contained.'],
  };
  const [title, detail] = labels[view] || labels.deal;
  $('#object-inspector').innerHTML = `
    <span class="label">Focused View</span>
    <strong>${title}</strong>
    <p>${detail}</p>
  `;
}

function selectPhase(phase) {
  selectedPhase = phase;
  const story = phaseStories[phase];
  setSelectedView(phaseViews[phase] || 'deal');
  $('#stage-title').textContent = `${story.title}: ${activeDeal?.dealId || 'No active deal'}`;
  $('#stage-summary').textContent = story.summary;
  $('#stage-evidence').textContent = story.evidence;
  renderPhaseRail(activeDeal?.phase || phase);
  protocolScene.update(cockpitData, selectedPhase);
  $('#object-inspector').innerHTML = `
    <span class="label">Replay Phase</span>
    <strong>${story.title}</strong>
    <p>${story.summary}</p>
  `;
}

function playReplay() {
  if (playbackTimer) {
    clearInterval(playbackTimer);
    playbackTimer = null;
    $('#playback').textContent = 'Play';
    return;
  }

  let index = Math.max(0, phases.indexOf(selectedPhase));
  $('#playback').textContent = 'Pause';
  selectPhase(phases[index]);
  playbackTimer = setInterval(() => {
    index = (index + 1) % phases.length;
    selectPhase(phases[index]);
  }, 1450);
}

class ProtocolScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.startedAt = performance.now();
    this.clickables = [];
    this.packetMeshes = [];
    this.gateMeshes = [];
    this.healthSampleCounter = 0;

    this.scene.fog = new THREE.FogExp2(0x080b10, 0.035);
    this.camera.position.set(0, 4.6, 10);
    this.camera.lookAt(0, 0, 0);

    this.build();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('pointerdown', (event) => this.select(event));
    this.animate();
  }

  build() {
    const ambient = new THREE.AmbientLight(0x6f94b8, 1.15);
    const key = new THREE.DirectionalLight(0x9ed4ff, 2);
    key.position.set(2, 5, 4);
    const rim = new THREE.PointLight(0x55e4ff, 60, 18);
    rim.position.set(0, 2, 1);
    this.scene.add(ambient, key, rim);

    const grid = new THREE.GridHelper(13, 26, 0x2e4962, 0x18212c);
    grid.position.y = -1.25;
    grid.material.transparent = true;
    grid.material.opacity = 0.34;
    this.scene.add(grid);

    this.sponsorNode = this.createAgentNode('Sponsor Agent', 'wallet + mandate', -4.6, 0, 0, 0x6db2ff);
    this.communityNode = this.createAgentNode('Community Agent', 'inventory + policy', 4.6, 0, 0, 0x54dea2);
    this.escrowCore = this.createEscrowCore();
    this.policyGates = [
      this.createGate('Signature Gate', 'EIP-712 freshness and wallet recovery', -2.2, 0.04, 0),
      this.createGate('Policy Gate', 'score, content, quote, and inventory checks', 0, 0.04, 0),
      this.createGate('Proof Gate', 'agreement and content hashes', 2.2, 0.04, 0),
    ];

    this.createCurves();
    this.createPackets();
  }

  createAgentNode(title, detail, x, y, z, color) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.82, 2),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2, metalness: 0.25, roughness: 0.38 })
    );
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(1.12, 0.018, 12, 96),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72 })
    );
    halo.rotation.x = Math.PI / 2;
    const label = this.createLabel(title, color);
    label.position.set(0, -1.34, 0);

    shell.userData = { title, detail, view: title.includes('Sponsor') || title.includes('Community') ? 'deal' : 'policy' };
    this.clickables.push(shell);
    group.add(shell, halo, label);
    this.scene.add(group);
    return group;
  }

  createEscrowCore() {
    const group = new THREE.Group();
    group.position.set(0, 0, 0);
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.92, 1),
      new THREE.MeshStandardMaterial({ color: 0xf5c862, emissive: 0xf5c862, emissiveIntensity: 0.22, metalness: 0.68, roughness: 0.24 })
    );
    const proofHalo = new THREE.Mesh(
      new THREE.TorusKnotGeometry(1.23, 0.018, 132, 8),
      new THREE.MeshBasicMaterial({ color: 0x55e4ff, transparent: true, opacity: 0.7 })
    );
    const label = this.createLabel('Escrow Core', 0xf5c862);
    label.position.set(0, -1.48, 0);
    core.userData = { title: 'Escrow Core', detail: 'USDC lock, agreement hash, content hash, settlement state.', view: 'proof', phase: 'ESCROW_FUNDED' };
    this.clickables.push(core);
    group.add(core, proofHalo, label);
    this.scene.add(group);
    return group;
  }

  createGate(title, detail, x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(0.56, 0.045, 16, 80),
      new THREE.MeshStandardMaterial({ color: 0x54dea2, emissive: 0x54dea2, emissiveIntensity: 0.36, metalness: 0.3, roughness: 0.32 })
    );
    torus.rotation.y = Math.PI / 2;
    torus.userData = { title, detail, view: title.includes('Proof') ? 'proof' : 'policy', phase: title.includes('Signature') ? 'HANDSHAKE_VERIFIED' : title.includes('Proof') ? 'ESCROW_FUNDED' : 'NEGOTIATING' };
    this.clickables.push(torus);
    this.gateMeshes.push(torus);
    group.add(torus);
    this.scene.add(group);
    return group;
  }

  createCurves() {
    this.curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-4.6, 0.16, 0),
      new THREE.Vector3(-2.2, 0.16, 0),
      new THREE.Vector3(0, 0.8, 0),
      new THREE.Vector3(2.2, 0.16, 0),
      new THREE.Vector3(4.6, 0.16, 0),
    ]);
    this.redCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(4.2, -1.3, -0.8),
      new THREE.Vector3(1.8, -0.46, -0.42),
      new THREE.Vector3(0, 0.04, 0),
    ]);

    for (const [curve, color, opacity] of [[this.curve, 0x6db2ff, 0.62], [this.redCurve, 0xff6676, 0.45]]) {
      const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(90));
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
      this.scene.add(line);
    }
  }

  createPackets() {
    for (let i = 0; i < 4; i++) {
      const packet = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.2, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x6db2ff, emissive: 0x6db2ff, emissiveIntensity: 0.55 })
      );
      packet.userData = { title: 'Signed Packet', detail: 'Handshake, offer, acceptance, and delivery messages travel as signed evidence.', view: 'policy', phase: 'NEGOTIATING' };
      this.clickables.push(packet);
      this.packetMeshes.push({ mesh: packet, offset: i / 4, curve: this.curve, speed: 0.08 });
      this.scene.add(packet);
    }

    const attack = new THREE.Mesh(
      new THREE.TetrahedronGeometry(0.28, 0),
      new THREE.MeshStandardMaterial({ color: 0xff6676, emissive: 0xff6676, emissiveIntensity: 0.7 })
    );
    attack.userData = { title: 'Rejected Attack', detail: 'Red-team packets terminate at deterministic policy gates before delivery.', view: 'redteam', phase: 'HANDSHAKE_VERIFIED' };
    this.clickables.push(attack);
    this.packetMeshes.push({ mesh: attack, offset: 0, curve: this.redCurve, speed: 0.05, bounce: true });
    this.scene.add(attack);
  }

  createLabel(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '600 42px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#edf3fb';
    ctx.shadowColor = `#${color.toString(16).padStart(6, '0')}`;
    ctx.shadowBlur = 12;
    ctx.fillText(text, 256, 58);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
    sprite.scale.set(2.2, 0.42, 1);
    return sprite;
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const width = Math.max(320, rect.width);
    const height = Math.max(360, rect.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.position.z = width < 720 ? 12.8 : 10;
    this.camera.position.y = width < 720 ? 5.8 : 4.6;
    this.camera.updateProjectionMatrix();
  }

  update(data, phase = selectedPhase) {
    const checks = data?.deals?.flatMap((deal) => allChecks(deal)) || [];
    const failed = checks.some((check) => !check.passed);
    const gateColor = failed ? 0xff6676 : 0x54dea2;
    this.gateMeshes.forEach((gate, index) => {
      const material = gate.material;
      const phaseColor = phaseStories[phase]?.color ?? gateColor;
      const activeGate = (phase === 'HANDSHAKE_VERIFIED' && index === 0) || (phase === 'NEGOTIATING' && index === 1) || (['ESCROW_FUNDED', 'DELIVERED', 'SETTLED'].includes(phase) && index === 2);
      const color = index === 1 && failed ? 0xff6676 : activeGate ? phaseColor : gateColor;
      material.color.setHex(color);
      material.emissive.setHex(color);
    });
  }

  animate() {
    const elapsed = (performance.now() - this.startedAt) / 1000;
    this.sponsorNode.rotation.y = elapsed * 0.18;
    this.communityNode.rotation.y = -elapsed * 0.16;
    this.escrowCore.rotation.y = elapsed * 0.32;
    this.escrowCore.rotation.x = Math.sin(elapsed * 0.45) * 0.14;
    this.policyGates.forEach((gate, index) => {
      gate.rotation.z = elapsed * (0.4 + index * 0.08);
      gate.position.y = Math.sin(elapsed * 1.2 + index) * 0.05;
    });

    for (const packet of this.packetMeshes) {
      const cycle = (elapsed * packet.speed + packet.offset) % 1;
      const t = packet.bounce ? Math.abs(Math.sin(cycle * Math.PI)) : cycle;
      const point = packet.curve.getPointAt(t);
      packet.mesh.position.copy(point);
      packet.mesh.rotation.x += 0.018;
      packet.mesh.rotation.y += 0.024;
    }

    this.renderer.render(this.scene, this.camera);
    this.healthSampleCounter++;
    if (this.healthSampleCounter % 45 === 0) this.sampleCanvasHealth();
    requestAnimationFrame(() => this.animate());
  }

  sampleCanvasHealth() {
    const gl = this.renderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const samples = [
      [Math.floor(width * 0.25), Math.floor(height * 0.5)],
      [Math.floor(width * 0.5), Math.floor(height * 0.5)],
      [Math.floor(width * 0.75), Math.floor(height * 0.5)],
      [Math.floor(width * 0.5), Math.floor(height * 0.32)],
    ];
    const pixel = new Uint8Array(4);
    let lit = 0;
    for (const [x, y] of samples) {
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      if (pixel[0] + pixel[1] + pixel[2] > 24) lit++;
    }
    this.canvas.dataset.renderHealth = `${lit}/${samples.length}`;
  }

  select(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.clickables, false)[0];
    if (!hit) return;
    const { title, detail, view, phase } = hit.object.userData;
    if (view) setSelectedView(view);
    if (phase) selectPhase(phase);
    $('#object-inspector').innerHTML = `
      <span class="label">Selected Node</span>
      <strong>${title}</strong>
      <p>${detail}</p>
    `;
  }
}

const protocolCanvas = $('#protocol-canvas');
const protocolScene = protocolCanvas ? new ProtocolScene(protocolCanvas) : { update() {} };

async function loadCockpit() {
  const response = await fetch('/api/cockpit');
  const data = await response.json();
  cockpitData = data;
  activeDeal = data.deals?.[0] || null;

  $('#metric-deals').textContent = data.stats.deals;
  $('#metric-proofs').textContent = `${data.stats.proofs} proof${data.stats.proofs === 1 ? '' : 's'}`;
  $('#metric-payments').textContent = `${data.stats.payments || 0} payment receipt${(data.stats.payments || 0) === 1 ? '' : 's'}`;
  $('#metric-checks').textContent = data.stats.policyChecks;
  $('#metric-redteam').textContent = data.redteam ? `${data.redteam.passed}/${data.redteam.total}` : 'n/a';
  $('#updated-at').textContent = `Updated ${formatTime(data.generatedAt)}`;
  $('#deals').innerHTML = renderDeals(data.deals || []);
  $('#proofs').innerHTML = renderProofs(data.proofs || []);
  $('#payments').innerHTML = renderPayments(data.payments || []);
  $('#policy-trail').innerHTML = renderPolicyTrail(data.deals || []);
  $('#redteam').innerHTML = renderRedteam(data.redteam);
  renderMandates(data.mandates);
  renderRunState(data.runState, data.theater, data.badcase);
  renderNarrative(data.narrative);
  renderPov(data.narrative, data.runState, data.theater);
  renderFlowBoard(data);
  renderRegistry(data);

  const proof = data.proofs?.[0];
  const currentPhase = theaterPhase(data.theater?.status) || activeDeal?.phase || proof?.phase || 'DISCOVERED';
  if (theaterPhase(data.theater?.status)) {
    selectedPhase = currentPhase;
  } else if (!selectedPhase || !phases.includes(selectedPhase)) {
    selectedPhase = currentPhase;
  }
  const story = phaseStories[selectedPhase] || phaseStories[currentPhase];
  const stageSubject = data.theater?.intent
    ? `theater intent ${data.theater.intent.id}${data.theater.escrow ? ` / escrow ${data.theater.escrow.id}` : ''}`
    : activeDeal?.dealId || 'No active deal';
  $('#stage-title').textContent = `${story.title}: ${stageSubject}`;
  $('#stage-summary').textContent = story.summary;
  const evidenceHash = data.theater?.proof?.proofHash || proof?.finalHash;
  $('#stage-evidence').textContent = evidenceHash ? `${story.evidence} | ${short(evidenceHash)}` : story.evidence;
  renderPhaseRail(currentPhase);
  protocolScene.update(data, selectedPhase);
}

$$('.metric-button').forEach((button) => button.addEventListener('click', () => setSelectedView(button.dataset.view)));
$('#refresh').addEventListener('click', loadCockpit);
$('#playback').addEventListener('click', playReplay);
$('#save-mandates').addEventListener('click', saveMandates);
$('#sponsor-intake-send').addEventListener('click', () => sendIntake('sponsor'));
$('#community-intake-send').addEventListener('click', () => sendIntake('community'));
$('#save-chat-mandates').addEventListener('click', saveChatMandates);
$('#run-two-agent-theater').addEventListener('click', () => startTwoAgentTheater(true));
$('#run-openclaw-duel').addEventListener('click', () => startOpenClawDuelRun(false));
$('#run-badcase').addEventListener('click', startBadCaseRun);
$('#run-openclaw-gemini').addEventListener('click', () => startOpenClawGeminiRun(true));
$('#run-openclaw-discord').addEventListener('click', () => startOpenClawGeminiRun(false));
$('#run-agenthon').addEventListener('click', () => startAgenthonRun(true));
$('#run-agenthon-discord').addEventListener('click', () => startAgenthonRun(false));
setSelectedView(selectedView);
renderIntake();
loadCockpit();
setInterval(loadCockpit, 5000);
