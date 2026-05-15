import axios from 'axios';
import { PersistenceService } from './persistenceService';

export interface Mem9Memory {
  id?: string;
  content?: string;
  source?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  score?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Mem9StoreInput {
  content: string;
  source?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface Mem9SearchInput {
  q?: string;
  tags?: string[];
  source?: string;
  limit?: number;
  memoryType?: string;
}

export interface Mem9Status {
  enabled: boolean;
  configured: boolean;
  apiUrl: string;
  lastWriteAt?: number;
  lastSearchAt?: number;
  lastError?: string;
  storedCount?: number;
}

const DEFAULT_API_URL = 'https://api.mem9.ai';
const STATUS_KEY = 'mem9_status';

export class Mem9MemoryService {
  private persistence = new PersistenceService();
  private apiUrl = (process.env.MEM9_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');
  private apiKey = process.env.MEM9_API_KEY || process.env.MEM9_TENANT_ID || '';
  private enabled = process.env.MEM9_ENABLED !== 'false';
  private timeoutMs = Number(process.env.MEM9_TIMEOUT_MS ?? 8000);

  isConfigured(): boolean {
    return Boolean(this.enabled && this.apiKey);
  }

  async status(): Promise<Mem9Status> {
    const stored = await this.persistence.loadState<Mem9Status>(STATUS_KEY);
    return {
      ...stored,
      enabled: this.enabled,
      configured: this.isConfigured(),
      apiUrl: this.apiUrl,
    };
  }

  async store(input: Mem9StoreInput): Promise<{ ok: boolean; id?: string; error?: string }> {
    if (!this.isConfigured()) {
      await this.writeStatus({ lastError: 'MEM9_API_KEY is not configured.' });
      return { ok: false, error: 'MEM9_API_KEY is not configured.' };
    }

    try {
      const response = await axios.post(
        `${this.apiUrl}/v1alpha2/mem9s/memories`,
        input,
        {
          headers: this.headers('adsourcing-runtime'),
          timeout: this.timeoutMs,
        },
      );
      const id = response.data?.id ?? response.data?.memory?.id;
      const current = await this.status();
      await this.writeStatus({
        lastWriteAt: Date.now(),
        lastError: undefined,
        storedCount: Number(current.storedCount ?? 0) + 1,
      });
      return { ok: true, id };
    } catch (error) {
      const message = formatError(error);
      await this.writeStatus({ lastError: message });
      return { ok: false, error: message };
    }
  }

  async search(input: Mem9SearchInput): Promise<{ ok: boolean; memories: Mem9Memory[]; error?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, memories: [], error: 'MEM9_API_KEY is not configured.' };
    }

    try {
      const params = new URLSearchParams();
      if (input.q) params.set('q', input.q);
      if (input.tags?.length) params.set('tags', input.tags.join(','));
      if (input.source) params.set('source', input.source);
      if (input.limit != null) params.set('limit', String(input.limit));
      if (input.memoryType) params.set('memory_type', input.memoryType);

      const response = await axios.get(`${this.apiUrl}/v1alpha2/mem9s/memories?${params.toString()}`, {
        headers: this.headers('adsourcing-runtime'),
        timeout: Number(process.env.MEM9_SEARCH_TIMEOUT_MS ?? this.timeoutMs),
      });

      await this.writeStatus({ lastSearchAt: Date.now(), lastError: undefined });
      return { ok: true, memories: response.data?.memories ?? response.data?.data ?? [] };
    } catch (error) {
      const message = formatError(error);
      await this.writeStatus({ lastError: message });
      return { ok: false, memories: [], error: message };
    }
  }

  private headers(agentName: string) {
    return {
      'content-type': 'application/json',
      'X-API-Key': this.apiKey,
      'X-Mnemo-Agent-Id': agentName,
    };
  }

  private async writeStatus(update: Partial<Mem9Status>): Promise<void> {
    const previous = await this.persistence.loadState<Mem9Status>(STATUS_KEY);
    await this.persistence.saveState(STATUS_KEY, {
      enabled: this.enabled,
      configured: this.isConfigured(),
      apiUrl: this.apiUrl,
      ...(previous ?? {}),
      ...update,
    });
  }
}

function formatError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const body = typeof error.response?.data === 'string'
      ? error.response.data
      : error.response?.data?.error || error.response?.data?.message;
    return body ? `${error.message}: ${body}` : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
