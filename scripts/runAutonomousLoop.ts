import * as dotenv from 'dotenv';
import { runDemo } from './runDemo';

dotenv.config();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const iterations = Number(process.env.AUTONOMOUS_LOOP_ITERATIONS ?? 1);
  const intervalMs = Number(process.env.AUTONOMOUS_LOOP_INTERVAL_MS ?? 15_000);

  console.log(`[AutonomousLoop] Starting. iterations=${iterations}, intervalMs=${intervalMs}`);

  for (let i = 0; i < iterations; i++) {
    console.log(`\n[AutonomousLoop] Cycle ${i + 1}/${iterations}`);
    await runDemo();
    if (i < iterations - 1) await sleep(intervalMs);
  }

  console.log('[AutonomousLoop] Complete.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
