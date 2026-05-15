import * as fs from 'fs/promises';
import * as path from 'path';
import { hashEvidence } from './evidenceService';
import { cachePath } from './pathConfig';

export interface PaymentReceipt {
  schemaVersion: 'admarket.payment-receipt.v1';
  receiptId: string;
  escrowId: string;
  amountUsdc: number;
  protocolFeePercent: number;
  protocolFeeUsdc: number;
  communityPayoutUsdc: number;
  status: 'FUNDED' | 'SETTLED' | 'DISPUTED' | 'REFUNDED';
  txHashes: string[];
  proofHash?: string;
  externalPaymentRail?: {
    provider: 'doku';
    invoiceNumber?: string;
    paymentUrl?: string;
    status: 'CREATED' | 'SKIPPED' | 'FAILED';
    error?: string;
  };
  generatedAt: number;
}

export function buildPaymentReceipt(input: {
  escrowId: string;
  amountUsdc: number;
  protocolFeePercent?: number;
  status: PaymentReceipt['status'];
  txHashes?: string[];
  proofHash?: string;
  externalPaymentRail?: PaymentReceipt['externalPaymentRail'];
}): PaymentReceipt {
  const protocolFeePercent = input.protocolFeePercent ?? 2;
  const protocolFeeUsdc = roundUsdc(input.amountUsdc * protocolFeePercent / 100);
  const communityPayoutUsdc = roundUsdc(input.amountUsdc - protocolFeeUsdc);
  const generatedAt = Date.now();

  const unsigned = {
    schemaVersion: 'admarket.payment-receipt.v1' as const,
    escrowId: input.escrowId,
    amountUsdc: input.amountUsdc,
    protocolFeePercent,
    protocolFeeUsdc,
    communityPayoutUsdc,
    status: input.status,
    txHashes: input.txHashes ?? [],
    proofHash: input.proofHash,
    externalPaymentRail: input.externalPaymentRail,
    generatedAt,
  };

  return {
    ...unsigned,
    receiptId: hashEvidence(unsigned),
  };
}

export async function writePaymentReceipt(
  receipt: PaymentReceipt,
  baseDir = cachePath('payment-receipts'),
): Promise<string> {
  const dir = path.resolve(baseDir);
  await fs.mkdir(dir, { recursive: true });
  const safeEscrowId = receipt.escrowId.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const filePath = path.join(dir, `${safeEscrowId}.payment.json`);
  await fs.writeFile(filePath, JSON.stringify(receipt, null, 2), 'utf-8');
  return filePath;
}

function roundUsdc(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
