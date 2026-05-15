import * as dotenv from 'dotenv';
import { DokuService } from '../services/dokuService';

dotenv.config();

async function main() {
  const doku = new DokuService();
  const status = await doku.status();
  console.log('[DOKU] Status:', {
    enabled: status.enabled,
    configured: status.configured,
    required: status.required,
    mode: status.mode,
    mcpEndpoint: status.mcpEndpoint,
    checkoutEndpoint: status.checkoutEndpoint,
  });

  if (process.env.DOKU_PREFLIGHT_CREATE_CHECKOUT !== 'true') {
    console.log('[DOKU] Set DOKU_PREFLIGHT_CREATE_CHECKOUT=true to create a sandbox checkout link.');
    return;
  }

  const result = await doku.createCheckout({
    amountUsd: Number(process.env.DOKU_PREFLIGHT_AMOUNT_USD ?? 10000),
    description: 'AdSourcing DOKU sandbox preflight checkout',
    escrowId: 'preflight',
    sponsorWallet: process.env.SPONSOR_WALLET_ADDRESS,
    communityWallet: process.env.COMMUNITY_WALLET_ADDRESS,
  });

  console.log('[DOKU] Checkout result:', {
    ok: result.ok,
    invoiceNumber: result.invoiceNumber,
    paymentUrl: result.paymentUrl,
    error: result.error,
  });

  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[DOKU] Preflight failed:', error.message || error);
  process.exitCode = 1;
});
