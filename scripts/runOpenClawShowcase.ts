import * as fs from 'fs/promises';
import * as path from 'path';
import { runDemo } from './runDemo';
import { runBadCase } from './runBadCase';

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

async function latestJson(dir: string, suffix: string) {
  try {
    const files = (await fs.readdir(dir)).filter((file) => file.endsWith(suffix));
    const rows: Array<{ file: string; data: any }> = await Promise.all(files.map(async (file) => ({
      file,
      data: await readJson(path.join(dir, file), null),
    })));
    return rows
      .filter((row) => row.data)
      .sort((a: any, b: any) => Number(b.data.generatedAt ?? 0) - Number(a.data.generatedAt ?? 0))[0];
  } catch {
    return undefined;
  }
}

export async function runOpenClawShowcase() {
  console.log('\n====== OPENCLAW AGENTHON SHOWCASE ======\n');
  console.log('[Showcase] 1/2 Running happy-path autonomous payment loop...');
  await runDemo();

  console.log('[Showcase] 2/2 Running guardrail rejection loop...');
  const badCase = await runBadCase();

  const proof = await latestJson(path.resolve('cache/proofs'), '.proof.json');
  const payment = await latestJson(path.resolve('cache/payment-receipts'), '.payment.json');

  console.log('\n====== JUDGE-FACING SUMMARY ======\n');
  console.log('Claim: AdSourcing turns a commercial mandate into a negotiated, escrowed, verified outcome.');
  console.log(`Payment receipt: ${payment?.file ?? 'none'} (${payment?.data?.status ?? 'n/a'})`);
  console.log(`Proof bundle: ${proof?.file ?? 'none'} (${proof?.data?.phase ?? 'n/a'})`);
  console.log(`Guardrail: ${badCase.scenario} -> ${badCase.actualDecision} before escrow.`);
  console.log('OpenClaw bridge: run `npm run openclaw` and call adsourcing_* tools from the plugin wrapper.');
}

if (require.main === module) {
  runOpenClawShowcase().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
