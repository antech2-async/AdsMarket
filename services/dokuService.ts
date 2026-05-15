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
const SANDBOX_CHECKOUT = 'mcp:create_doku_direct_checkout';
const PRODUCTION_CHECKOUT = 'mcp:create_doku_direct_checkout';

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
  private idrPerUsd = Number(process.env.DOKU_IDR_PER_USD ?? 16000);

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
    const amountIdr = String(Math.max(1000, Math.round(input.amountUsd * this.idrPerUsd)));
    try {
      const data = await this.callMcpTool('create_doku_direct_checkout', {
        toolRequest: {
          amount: amountIdr,
          currency: 'IDR',
          customerName: process.env.DOKU_CUSTOMER_NAME || 'AdSourcing Sponsor Agent',
          customerEmail: process.env.DOKU_CUSTOMER_EMAIL || 'sponsor@adsourcing.local',
          customerPhone: process.env.DOKU_CUSTOMER_PHONE || '+6281234567890',
          invoiceNumber,
        },
      });

      const paymentUrl =
        data?.response?.payment?.url
        ?? data?.payment?.url
        ?? data?.checkout_url
        ?? data?.url;

      await this.writeStatus({
        lastCheckoutAt: Date.now(),
        lastInvoiceNumber: invoiceNumber,
        lastPaymentUrl: paymentUrl,
        lastError: undefined,
      });

      return {
        ok: true,
        provider: 'doku',
        invoiceNumber: data?.invoiceNumber ?? invoiceNumber,
        paymentUrl,
        raw: data,
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

  private async callMcpTool(name: string, args: Record<string, unknown>): Promise<any> {
    const response = await axios.post(
      this.mcpEndpoint,
      {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name,
          arguments: args,
        },
      },
      {
        headers: {
          ...this.headers(`REQ-${Date.now()}`),
          accept: 'application/json, text/event-stream',
        },
        timeout: this.timeoutMs,
      },
    );

    const result = response.data?.result;
    if (response.data?.error) {
      throw new Error(response.data.error.message || JSON.stringify(response.data.error));
    }
    if (result?.isError) {
      const message = result.content?.map((item: any) => item.text).filter(Boolean).join('\n') || 'DOKU MCP tool returned an error.';
      throw new Error(message);
    }

    const text = result?.content?.find((item: any) => item.type === 'text')?.text;
    if (!text) return result;
    try {
      return JSON.parse(text);
    } catch {
      return { text };
    }
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
