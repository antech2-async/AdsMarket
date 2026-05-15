import type { CommunityMandate } from '../agents/communityAgent';
import type { SponsorMandate } from '../agents/sponsorAgent';
import type { NegotiationOffer, NegotiationResponse } from '../types/messages';
import type { PolicyCheck, PolicyDecision } from '../types/deal';

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 30 * 1000;

type CheckInput = Omit<PolicyCheck, 'severity'> & { severity?: PolicyCheck['severity'] };

function decision(checks: CheckInput[]): PolicyDecision {
  const normalized: PolicyCheck[] = checks.map((check) => ({
    severity: check.severity ?? (check.passed ? 'info' : 'block'),
    ...check,
  }));

  const blockingFailures = normalized.filter((check) => !check.passed && check.severity === 'block');

  return {
    allowed: blockingFailures.length === 0,
    checks: normalized,
    reasons: blockingFailures.map((check) => check.detail),
  };
}

function timestampCheck(timestamp: number, now = Date.now()): CheckInput {
  const age = now - timestamp;
  const passed = Number.isFinite(timestamp) && age <= FIVE_MINUTES_MS && age >= -MAX_FUTURE_SKEW_MS;

  return {
    id: 'message.timestamp.fresh',
    passed,
    detail: passed ? 'Message timestamp is fresh.' : 'Message timestamp is stale or from too far in the future.',
    observed: timestamp,
    expected: `within ${FIVE_MINUTES_MS}ms old and ${MAX_FUTURE_SKEW_MS}ms future skew`,
  };
}

function walletMatchCheck(expected: string, observed: string): CheckInput {
  const passed = expected.toLowerCase() === observed.toLowerCase();
  return {
    id: 'identity.wallet.matchesRegistry',
    passed,
    detail: passed ? 'Sender wallet matches ERC-8004 registry owner.' : 'Sender wallet does not match ERC-8004 registry owner.',
    observed,
    expected,
  };
}

function signatureCheck(valid: boolean): CheckInput {
  return {
    id: 'message.signature.valid',
    passed: valid,
    detail: valid ? 'Signature recovered to the claimed wallet.' : 'Signature did not recover to the claimed wallet.',
  };
}

function scoreCheck(score: number, threshold: number, id: string): CheckInput {
  const passed = score >= threshold;
  return {
    id,
    passed,
    detail: passed ? 'Counterparty reputation score meets threshold.' : 'Counterparty reputation score is below threshold.',
    observed: score,
    expected: `>= ${threshold}`,
  };
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9.%$]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const CONTENT_RULE_KEYWORDS: Record<string, string[]> = {
  gambling: ['casino', 'bet', 'betting', 'gambling', 'lottery', 'wager', 'slot machine', 'casino slots', 'jackpot'],
  scam: ['scam', 'guaranteed return', 'guaranteed returns', 'guaranteed profit', 'no risk', 'risk free', '1000x', 'pure profit', 'get rich quick'],
  adult: ['adult', 'porn', 'xxx', 'nsfw', 'sexual'],
  medical: ['medical advice', 'cure', 'guaranteed cure', 'diagnose', 'prescription'],
  offensive: ['slur', 'hate speech'],
};

function termsForRule(rule: string): string[] {
  const normalized = normalizeText(rule);
  const terms = new Set<string>();

  for (const [category, keywords] of Object.entries(CONTENT_RULE_KEYWORDS)) {
    if (normalized.includes(category)) {
      keywords.forEach((keyword) => terms.add(keyword));
    }
  }

  if (normalized.startsWith('no ')) {
    terms.add(normalized.replace(/^no\s+/, '').trim());
  }

  return [...terms].filter(Boolean);
}

function includesBlockedTerm(normalizedCopy: string, term: string): boolean {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(normalizedCopy);
}

function contentChecks(contentRules: string[], adCopy: string): CheckInput[] {
  const normalizedCopy = normalizeText(adCopy);
  const checks: CheckInput[] = [];

  for (const rule of contentRules) {
    const blockedTerms = termsForRule(rule);
    if (blockedTerms.length === 0) {
      checks.push({
        id: `content.rule.${normalizeText(rule).replace(/\s+/g, '-')}`,
        passed: true,
        severity: 'warn',
        detail: `No deterministic keywords configured for rule "${rule}".`,
      });
      continue;
    }

    const matched = blockedTerms.filter((term) => includesBlockedTerm(normalizedCopy, term));
    checks.push({
      id: `content.rule.${normalizeText(rule).replace(/\s+/g, '-')}`,
      passed: matched.length === 0,
      detail: matched.length === 0 ? `Ad copy does not trigger "${rule}".` : `Ad copy triggers blocked rule "${rule}".`,
      observed: matched,
      expected: 'no blocked terms',
    });
  }

  return checks;
}

export class SponsorPolicy {
  constructor(private readonly mandate: SponsorMandate) {}

  evaluateHandshake(params: {
    signatureValid: boolean;
    registryWallet: string;
    senderWallet: string;
    senderScore: number;
    timestamp: number;
  }): PolicyDecision {
    return decision([
      signatureCheck(params.signatureValid),
      timestampCheck(params.timestamp),
      walletMatchCheck(params.registryWallet, params.senderWallet),
      scoreCheck(params.senderScore, this.mandate.minReputationScore, 'reputation.community.minScore'),
    ]);
  }

  evaluateOutboundOffer(parsedOffer: any, round: number): PolicyDecision {
    return decision([
      {
        id: 'negotiation.round.limit',
        passed: Number.isInteger(round) && round >= 1 && round <= 3,
        detail: 'Offer round must be between 1 and 3.',
        observed: round,
        expected: '1..3',
      },
      {
        id: 'budget.offer.maxPrice',
        passed: Number(parsedOffer.offeredPriceUsdc) <= this.mandate.maxPricePerPostUsdc,
        detail: 'Offer must not exceed sponsor maximum price.',
        observed: parsedOffer.offeredPriceUsdc,
        expected: `<= ${this.mandate.maxPricePerPostUsdc}`,
      },
      {
        id: 'budget.offer.positive',
        passed: Number(parsedOffer.offeredPriceUsdc) > 0,
        detail: 'Offer price must be positive.',
        observed: parsedOffer.offeredPriceUsdc,
        expected: '> 0',
      },
      {
        id: 'delivery.duration.reasonable',
        passed: Number(parsedOffer.postDurationHours ?? 6) > 0 && Number(parsedOffer.postDurationHours ?? 6) <= 168,
        detail: 'Post duration must be between 1 hour and 7 days.',
        observed: parsedOffer.postDurationHours,
        expected: '1..168 hours',
      },
      {
        id: 'delivery.postType.valid',
        passed: ['standard', 'pinned', undefined].includes(parsedOffer.postType),
        detail: 'Post type must be standard or pinned.',
        observed: parsedOffer.postType,
        expected: 'standard | pinned',
      },
    ]);
  }

  evaluateCounter(counter: NegotiationResponse): PolicyDecision {
    return decision([
      {
        id: 'counter.price.withinBudget',
        passed: counter.type !== 'COUNTER' || Number(counter.offeredPriceUsdc) <= this.mandate.maxPricePerPostUsdc,
        detail: 'Counter-offer must fit sponsor budget.',
        observed: counter.offeredPriceUsdc,
        expected: `<= ${this.mandate.maxPricePerPostUsdc}`,
      },
      timestampCheck(counter.timestamp),
    ]);
  }
}

export class CommunityPolicy {
  constructor(private readonly mandate: CommunityMandate) {}

  evaluateHandshake(params: {
    signatureValid: boolean;
    registryWallet: string;
    senderWallet: string;
    senderScore: number;
    timestamp: number;
    adsPostedToday: number;
  }): PolicyDecision {
    return decision([
      signatureCheck(params.signatureValid),
      timestampCheck(params.timestamp),
      walletMatchCheck(params.registryWallet, params.senderWallet),
      scoreCheck(params.senderScore, this.mandate.minSponsorScore, 'reputation.sponsor.minScore'),
      {
        id: 'inventory.dailyAdLimit',
        passed: params.adsPostedToday < this.mandate.maxAdsPerDay,
        detail: params.adsPostedToday < this.mandate.maxAdsPerDay
          ? 'Community has ad inventory remaining today.'
          : 'Community daily ad inventory is exhausted.',
        observed: params.adsPostedToday,
        expected: `< ${this.mandate.maxAdsPerDay}`,
      },
    ]);
  }

  evaluateIncomingOffer(offer: NegotiationOffer, adCopy: string): PolicyDecision {
    return decision([
      timestampCheck(offer.timestamp),
      {
        id: 'negotiation.round.limit',
        passed: Number.isInteger(offer.round) && offer.round >= 1 && offer.round <= 3,
        detail: 'Offer round must be between 1 and 3.',
        observed: offer.round,
        expected: '1..3',
      },
      {
        id: 'delivery.postType.valid',
        passed: ['standard', 'pinned'].includes(offer.postType),
        detail: 'Post type must be standard or pinned.',
        observed: offer.postType,
        expected: 'standard | pinned',
      },
      ...contentChecks(this.mandate.contentRules, adCopy),
    ]);
  }

  enforceEvaluation(
    offer: NegotiationOffer,
    modelDecision: any,
    minimumAcceptablePrice = this.mandate.priceFloorUsdc
  ): { decision: any; policy: PolicyDecision } {
    const checks: CheckInput[] = [];
    const patched = { ...modelDecision };

    if (patched.decision === 'ACCEPT' && offer.offeredPriceUsdc < minimumAcceptablePrice) {
      patched.decision = 'COUNTER';
      patched.counterPriceUsdc = minimumAcceptablePrice;
      patched.counterDurationHours = patched.counterDurationHours ?? offer.postDurationHours;
      patched.counterPostType = patched.counterPostType ?? offer.postType;
      patched.reason = 'Deterministic policy raised the response to the community quote.';
    }

    checks.push({
      id: 'community.priceFloor.enforced',
      passed: patched.decision !== 'ACCEPT' || offer.offeredPriceUsdc >= minimumAcceptablePrice,
      detail: 'Community cannot accept an offer below its active quote.',
      observed: offer.offeredPriceUsdc,
      expected: `>= ${minimumAcceptablePrice}`,
    });

    checks.push({
      id: 'community.decision.valid',
      passed: ['ACCEPT', 'COUNTER', 'REJECT'].includes(patched.decision),
      detail: 'Negotiation response must be ACCEPT, COUNTER, or REJECT.',
      observed: patched.decision,
      expected: 'ACCEPT | COUNTER | REJECT',
    });

    return { decision: patched, policy: decision(checks) };
  }
}
