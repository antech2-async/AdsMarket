import axios from 'axios';

export interface ReplizStatus {
  configured: boolean;
  hasGrantCode: boolean;
  apiUrl: string;
  lastCheckAt?: number;
  accountCount?: number;
  lastError?: string;
}

export class ReplizService {
  private apiUrl = (process.env.REPLIZ_API_URL || 'https://api.repliz.com').replace(/\/+$/, '');
  private accessKey = process.env.REPLIZ_ACCESS_KEY || '';
  private secretKey = process.env.REPLIZ_SECRET_KEY || '';
  private grantCode = process.env.REPLIZ_KEY || '';

  isConfigured(): boolean {
    return Boolean(this.accessKey && this.secretKey);
  }

  async status(): Promise<ReplizStatus> {
    if (!this.isConfigured()) {
      return {
        configured: false,
        hasGrantCode: Boolean(this.grantCode),
        apiUrl: this.apiUrl,
        lastError: this.grantCode
          ? 'REPLIZ_KEY grant code is present, but Repliz API requires REPLIZ_ACCESS_KEY and REPLIZ_SECRET_KEY.'
          : 'Repliz API credentials are not configured.',
      };
    }

    try {
      const accounts = await this.listAccounts();
      return {
        configured: true,
        hasGrantCode: Boolean(this.grantCode),
        apiUrl: this.apiUrl,
        lastCheckAt: Date.now(),
        accountCount: accounts.length,
      };
    } catch (error: any) {
      return {
        configured: true,
        hasGrantCode: Boolean(this.grantCode),
        apiUrl: this.apiUrl,
        lastCheckAt: Date.now(),
        lastError: formatError(error),
      };
    }
  }

  async listAccounts(): Promise<any[]> {
    const response = await axios.get(`${this.apiUrl}/public/account`, {
      params: { page: 1, limit: 20 },
      headers: this.headers(),
      timeout: 8000,
    });
    const body = response.data;
    if (Array.isArray(body)) return body;
    if (Array.isArray(body?.data)) return body.data;
    if (Array.isArray(body?.accounts)) return body.accounts;
    return [];
  }

  async recordDiscordDelivery(postId: string): Promise<void> {
    if (!this.isConfigured()) {
      if (this.grantCode) {
        console.warn('[Repliz] Grant code is present, but API access/secret keys are not configured. Redeem the code in Repliz, then set REPLIZ_ACCESS_KEY and REPLIZ_SECRET_KEY.');
      } else {
        console.warn('[Repliz] Skipped. Repliz API credentials are not configured.');
      }
      return;
    }

    try {
      const accounts = await this.listAccounts();
      console.log(`[Repliz] API connected. ${accounts.length} social account(s) available. Discord proof ${postId} recorded in AdSourcing evidence; Repliz public API does not expose Discord monitoring.`);
    } catch (error: any) {
      console.warn(`[Repliz] API check failed: ${formatError(error)}.`);
    }
  }

  private headers() {
    const token = Buffer.from(`${this.accessKey}:${this.secretKey}`).toString('base64');
    return {
      authorization: `Basic ${token}`,
      'content-type': 'application/json',
    };
  }
}

function formatError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const body = typeof error.response?.data === 'string'
      ? error.response.data
      : error.response?.data?.message || error.response?.data?.error;
    return body ? `${error.message}: ${body}` : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
