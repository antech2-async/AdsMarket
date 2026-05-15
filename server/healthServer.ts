import express from 'express';
import { createPublicClient, formatUnits, http } from 'viem';
import { baseSepolia } from 'viem/chains';

/**
 * A simple health check and status reporter for agents.
 */
export function createHealthServer(agent: any, port: number) {
  const app = express();
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC_URL),
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: Date.now() });
  });

  app.get('/status', async (req, res) => {
    try {
      const runtimeStatus = typeof agent.getRuntimeStatus === 'function'
        ? agent.getRuntimeStatus()
        : {};
      const address = runtimeStatus.address ?? (agent as any).account?.address;
      
      // Basic wallet balance (ETH for gas)
      const balance = address ? await publicClient.getBalance({ address }) : 0n;

      res.json({
        ...runtimeStatus,
        ethBalance: formatUnits(balance, 18),
        lastReset: runtimeStatus.lastAdResetTimestamp ? new Date(runtimeStatus.lastAdResetTimestamp).toISOString() : null,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.listen(port, () => {
    console.log(`[HealthServer] Health check listening on port ${port}`);
  });

  return app;
}
