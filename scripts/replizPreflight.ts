import * as dotenv from 'dotenv';
import { ReplizService } from '../services/replizService';

dotenv.config();

async function main() {
  const repliz = new ReplizService();
  const status = await repliz.status();
  console.log('[Repliz] Status:', {
    configured: status.configured,
    hasGrantCode: status.hasGrantCode,
    apiUrl: status.apiUrl,
    accountCount: status.accountCount,
    lastError: status.lastError,
  });

  if (!status.configured) {
    console.log('[Repliz] Redeem the organizer code in Repliz, then set REPLIZ_ACCESS_KEY and REPLIZ_SECRET_KEY.');
    process.exitCode = 1;
    return;
  }

  if (status.lastError) {
    process.exitCode = 1;
    return;
  }

  const accounts = await repliz.listAccounts();
  console.log('[Repliz] Connected accounts:', accounts.map((account: any) => ({
    id: account._id ?? account.id,
    type: account.type,
    name: account.name,
    username: account.username,
    isConnected: account.isConnected,
  })));
}

main().catch((error) => {
  console.error('[Repliz] Preflight failed:', error.message || error);
  process.exitCode = 1;
});
