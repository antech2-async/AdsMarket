import * as fs from 'fs/promises';
import * as path from 'path';
import { CACHE_DIR } from './pathConfig';

/**
 * Simple file-based persistence for agent state.
 */
export class PersistenceService {
  private cacheDir: string;

  constructor(baseDir: string = 'cache') {
    this.cacheDir = path.isAbsolute(baseDir) ? baseDir : path.join(CACHE_DIR, baseDir === 'cache' ? '' : baseDir);
  }

  private async ensureCacheDir(): Promise<void> {
    try {
      await fs.access(this.cacheDir);
    } catch {
      await fs.mkdir(this.cacheDir, { recursive: true });
    }
  }

  async saveState<T>(fileName: string, state: T): Promise<void> {
    await this.ensureCacheDir();
    const filePath = path.join(this.cacheDir, `${fileName}.json`);
    await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  async loadState<T>(fileName: string): Promise<T | null> {
    const filePath = path.join(this.cacheDir, `${fileName}.json`);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }

  async clearState(fileName: string): Promise<void> {
    const filePath = path.join(this.cacheDir, `${fileName}.json`);
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore if file doesn't exist
    }
  }
}
