import { createHash } from 'crypto';
import type { DecisionReceipt, DealEvent, PolicyDecision, ReceiptRisk } from '../types/deal';

export interface ReceiptInput {
  actor: DealEvent['actor'];
  action: string;
  summary: string;
  policy?: PolicyDecision;
  proof?: Array<string | undefined>;
  nextStep?: string;
  createdAt?: number;
}

export function buildDecisionReceipt(input: ReceiptInput): DecisionReceipt {
  const createdAt = input.createdAt ?? Date.now();
  const policyChecks = (input.policy?.checks ?? []).map((check) => ({
    id: check.id,
    passed: check.passed,
    detail: check.detail,
  }));
  const failed = input.policy?.checks.filter((check) => !check.passed) ?? [];
  const blocking = failed.filter((check) => check.severity === 'block');
  const risk: ReceiptRisk = blocking.length > 0 ? 'high' : failed.length > 0 ? 'medium' : 'low';
  const proof = input.proof?.filter(Boolean) as string[] | undefined;

  return {
    id: receiptId(input.actor, input.action, createdAt),
    actor: input.actor,
    action: input.action,
    why: input.summary,
    risk,
    policyChecks,
    proof: proof ?? [],
    nextStep: input.nextStep,
    createdAt,
  };
}

export function receiptHash(receipt: DecisionReceipt): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(receipt)).digest('hex')}`;
}

function receiptId(actor: string, action: string, createdAt: number): string {
  const raw = `${actor}:${action}:${createdAt}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}
