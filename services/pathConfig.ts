import * as path from 'path';

export const REPO_ROOT = path.resolve(__dirname, '..');
export const CACHE_DIR = path.join(REPO_ROOT, 'cache');

export function cachePath(...segments: string[]) {
  return path.join(CACHE_DIR, ...segments);
}
