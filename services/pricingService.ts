import type { CommunityMandate } from '../agents/communityAgent';

export interface CommunityQuoteInput {
  mandate: CommunityMandate;
  sponsorScore: number;
  postType: 'standard' | 'pinned';
  adsPostedToday: number;
}

export interface CommunityQuote {
  priceUsdc: number;
  floorUsdc: number;
  multipliers: {
    postType: number;
    inventoryPressure: number;
    reputationDiscount: number;
  };
  explanation: string;
}

export function quoteCommunityPost(input: CommunityQuoteInput): CommunityQuote {
  const postTypeMultiplier = input.postType === 'pinned' ? 1.6 : 1;
  const inventoryRatio = input.mandate.maxAdsPerDay > 0
    ? input.adsPostedToday / input.mandate.maxAdsPerDay
    : 1;
  const inventoryPressure = inventoryRatio >= 0.66 ? 1.35 : inventoryRatio >= 0.33 ? 1.15 : 1;
  const reputationDiscount = input.sponsorScore >= 85 ? 0.92 : input.sponsorScore >= 75 ? 0.97 : 1;

  const raw = input.mandate.priceFloorUsdc * postTypeMultiplier * inventoryPressure * reputationDiscount;
  const priceUsdc = Math.max(input.mandate.priceFloorUsdc, Math.round(raw));

  return {
    priceUsdc,
    floorUsdc: input.mandate.priceFloorUsdc,
    multipliers: {
      postType: postTypeMultiplier,
      inventoryPressure,
      reputationDiscount,
    },
    explanation: `Quote is $${priceUsdc}: base floor $${input.mandate.priceFloorUsdc}, post type x${postTypeMultiplier}, inventory x${inventoryPressure}, reputation x${reputationDiscount}.`,
  };
}
