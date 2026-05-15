import axios from 'axios';
import { PersistenceService } from './persistenceService';

export interface DokuStatus {
  enabled: boolean;
  configured: boolean;
  required: boolean;
  mode: 'sandbox' | 'production';
  mcpEndpoint: string;
  checkoutEndpoint: string;
  lastCheckoutAt?: number;
  lastInvoiceNumber?: string;
  lastPaymentUrl?: string;
  lastError?: string;
}

export interface DokuCheckoutInput {
  amountUsd: number;
  description: string;
  escrowId?: string;
  sponsorWallet?: string;
  communityWallet?: string;
}

export interface DokuCheckoutResult {
  ok: boolean;
  provider: 'doku';
  invoiceNumber?: string;
  paymentUrl?: string;
  raw?: unknown;
  error?: string;
}

const STATUS_KEY = 'doku_status';
const SANDBOX_MCP = 'https://api-sandbox.doku.com/doku-mcp-server/mcp';
const PRODUCTION_MCP = 'https://mcp.doku.com/mcp';
const SANDBOX_CHECKOUT = 'https://api-sandbox.doku.com/checkout/v1/payment';
const PRODUCTION_CHECKOUT = 'https://api.doku.com/checkout/v1/payment';

export class DokuService {
  private persistence = new PersistenceService();
  private enabled = process.env.DOKU_ENABLE_CHECKOUT === 'true';
  private required = process.env.DOKU_REQUIRED === 'true';
  private mode: 'sandbox' | 'production' = process.env.DOKU_MODE === 'production' ? 'production' : 'sandbox';
  private clientId = process.env.DOKU_CLIENT_ID || '';
  private apiKey = process.env.DOKU_API_KEY || '';
  private authorization = process.env.DOKU_AUTHORIZATION || (this.apiKey ? Buffer.from(`${this.apiKey}:`).toString('base64') : '');
  private mcpEndpoint = process.env.DOKU_MCP_ENDPOINT || (this.mode === 'production' ? PRODUCTION_MCP : SANDBOX_MCP);
  private checkoutEndpoint = process.env.DOKU_CHECKOUT_ENDPOINT || (this.mode === 'production' ? PRODUCTION_CHECKOUT : SANDBOX_CHECKOUT);
  private timeoutMs = Number(process.env.DOKU_TIMEOUT_MS ?? 10000);

  isConfigured(): boolean {
    return Boolean(this.enabled && this.clientId && this.authorization);
  }

  async status(): Promise<DokuStatus> {
    const stored = await this.persistence.loadState<DokuStatus>(STATUS_KEY);
    return {
      ...(stored ?? {}),
      enabled: this.enabled,
      configured: this.isConfigured(),
      required: this.required,
      mode: this.mode,
      mcpEndpoint: this.mcpEndpoint,
      checkoutEndpoint: this.checkoutEndpoint,
    };
  }

  async createCheckout(input: DokuCheckoutInput): Promise<DokuCheckoutResult> {
    if (!this.enabled) {
      return { ok: false, provider: 'doku', error: 'DOKU_ENABLE_CHECKOUT is not true.' };
    }
    if (!this.isConfigured()) {
      const error = 'DOKU_CLIENT_ID and DOKU_API_KEY or DOKU_AUTHORIZATION are required.';
      await this.writeStatus({ lastError: error });
      return { ok: false, provider: 'doku', error };
    }

    const invoiceNumber = `ADS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    try {
      const response = await axios.post(
        this.checkoutEndpoint,
        {
          order: {
            invoice_number: invoiceNumber,
            amount: Math.max(1, Math.round(input.amountUsd)),
          },
          payment: {
            payment_due_date: 60,
          },
          customer: {
            name: 'AdSourcing Sponsor Agent',
            email: process.env.DOKU_CUSTOMER_EMAIL || 'sponsor@adsourcing.local',
          },
          additional_info: {
            description: input.description,
            escrow_id: input.escrowId,
            sponsor_wallet: input.sponsorWallet,
            community_wallet: input.communityWallet,
          },
        },
        {
          headers: this.headers(invoiceNumber),
          timeout: this.timeoutMs,
        },
      );

      const paymentUrl =
        response.data?.response?.payment?.url
        ?? response.data?.payment?.url
        ?? response.data?.checkout_url
        ?? response.data?.url;

      await this.writeStatus({
        lastCheckoutAt: Date.now(),
        lastInvoiceNumber: invoiceNumber,
        lastPaymentUrl: paymentUrl,
        lastError: undefined,
      });

      return {
        ok: true,
        provider: 'doku',
        invoiceNumber,
        paymentUrl,
        raw: response.data,
      };
    } catch (error) {
      const message = formatError(error);
      await this.writeStatus({ lastError: message, lastInvoiceNumber: invoiceNumber });
      return { ok: false, provider: 'doku', invoiceNumber, error: message };
    }
  }

  private headers(requestId: string) {
    return {
      'content-type': 'application/json',
      'Client-Id': this.clientId,
      'Authorization': `Basic ${this.authorization}`,
      'Request-Id': requestId,
      'Request-Timestamp': new Date().toISOString(),
    };
  }

  private async writeStatus(update: Partial<DokuStatus>): Promise<void> {
    const previous = await this.persistence.loadState<DokuStatus>(STATUS_KEY);
    await this.persistence.saveState(STATUS_KEY, {
      ...(previous ?? {}),
      enabled: this.enabled,
      configured: this.isConfigured(),
      required: this.required,
      mode: this.mode,
      mcpEndpoint: this.mcpEndpoint,
      checkoutEndpoint: this.checkoutEndpoint,
      ...update,
    });
  }
}

function formatError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const body = typeof error.response?.data === 'string'
      ? error.response.data
      : error.response?.data?.error?.message || error.response?.data?.message || error.response?.data?.error;
    return body ? `${error.message}: ${body}` : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
