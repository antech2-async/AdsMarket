import express from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { spawn } from 'child_process';
import { CACHE_DIR, REPO_ROOT } from '../services/pathConfig';
import { loadConfiguredMandates, saveConfiguredMandates } from '../services/mandateConfigService';
import { AgentMemoryService } from '../services/agentMemoryService';
import { DokuService } from '../services/dokuService';

dotenv.config();

const app = express();
const PORT = Number(process.env.DASHBOARD_PORT ?? 4010);
const ROOT = REPO_ROOT;
const DASHBOARD_DIR = path.join(ROOT, 'dashboard');
const RUN_STATE_FILE = path.join(CACHE_DIR, 'dashboard-run-state.json');
const memoryService = new AgentMemoryService();
const dokuService = new DokuService();
const DEFAULT_OPENCLAW_MODEL =
  process.env.ADSOURCING_OPENCLAW_MODEL
  ?? process.env.OPENCLAW_MODEL
  ?? 'zai/glm-5.1';

let activeRun: ReturnType<typeof spawn> | null = null;
let bridgeRun: ReturnType<typeof spawn> | null = null;
let activeSequence = false;

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

async function listProofs() {
  const proofsDir = path.join(CACHE_DIR, 'proofs');
  try {
    const files = await fs.readdir(proofsDir);
    const proofs = await Promise.all(
      files
        .filter((file) => file.endsWith('.proof.json'))
        .map(async (file) => readJson(path.join(proofsDir, file), null)),
    );
    return proofs.filter(Boolean);
  } catch {
    return [];
  }
}

async function listPayments() {
  const paymentsDir = path.join(CACHE_DIR, 'payment-receipts');
  try {
    const files = await fs.readdir(paymentsDir);
    const payments = await Promise.all(
      files
        .filter((file) => file.endsWith('.payment.json'))
        .map(async (file) => readJson(path.join(paymentsDir, file), null)),
    );
    return payments.filter(Boolean);
  } catch {
    return [];
  }
}

async function latestVerifiedEvidence() {
  const [proofs, payments] = await Promise.all([listProofs(), listPayments()]);
  const latestPayment = [...payments].sort((a: any, b: any) => Number(b.generatedAt ?? 0) - Number(a.generatedAt ?? 0))[0] as any;
  const latestProof = [...proofs].sort((a: any, b: any) => Number(b.generatedAt ?? b.updatedAt ?? 0) - Number(a.generatedAt ?? a.updatedAt ?? 0))[0] as any;
  return {
    settlementStatus: latestPayment?.status ?? null,
    escrowId: latestPayment?.escrowId ?? null,
    amountUsdc: latestPayment?.amountUsdc ?? null,
    protocolFeeUsdc: latestPayment?.protocolFeeUsdc ?? null,
    communityPayoutUsdc: latestPayment?.communityPayoutUsdc ?? null,
    receiptId: latestPayment?.receiptId ?? null,
    proofHash: latestPayment?.proofHash ?? latestProof?.finalHash ?? latestProof?.proofHash ?? null,
    txHashes: latestPayment?.txHashes ?? [],
    generatedAt: latestPayment?.generatedAt ?? latestProof?.generatedAt ?? null,
  };
}

async function writeRunState(patch: Record<string, unknown>) {
  const previous = await readJson<Record<string, any>>(RUN_STATE_FILE, {});
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(RUN_STATE_FILE, JSON.stringify({
    ...previous,
    ...patch,
    updatedAt: Date.now(),
  }, null, 2), 'utf-8');
}

async function loadFreshEnv() {
  const parsed = dotenv.config({ path: path.join(ROOT, '.env'), override: true }).parsed ?? {};
  return { ...process.env, ...parsed };
}

function openClawProcess(env: NodeJS.ProcessEnv, args: string[]) {
  const configuredBin = String(env.OPENCLAW_BIN ?? '').trim();
  if (configuredBin) {
    return {
      command: configuredBin,
      args,
      display: `${configuredBin} ${args.join(' ')}`,
    };
  }

  if (process.platform === 'win32') {
    return {
      command: process.execPath,
      args: [
        path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js'),
        '-y',
        'openclaw',
        ...args,
      ],
      display: `npx -y openclaw ${args.join(' ')}`,
    };
  }

  return {
    command: 'npx',
    args: ['-y', 'openclaw', ...args],
    display: `npx -y openclaw ${args.join(' ')}`,
  };
}

async function bridgeHealthy() {
  try {
    const response = await fetch('http://127.0.0.1:4020/openclaw/health');
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureOpenClawBridge(runLogs: string[]) {
  if (await bridgeHealthy()) {
    runLogs.push('[Dashboard] OpenClaw bridge is already healthy on :4020.');
    return;
  }

  if (!bridgeRun) {
    runLogs.push('[Dashboard] Starting AdSourcing OpenClaw bridge on :4020...');
    const child = spawn('npm', ['run', 'openclaw:bridge'], {
      cwd: ROOT,
      env: await loadFreshEnv(),
      shell: true,
      windowsHide: true,
    });
    bridgeRun = child;

    child.stdout?.on('data', (chunk) => runLogs.push(...String(chunk).split(/\r?\n/).filter(Boolean)));
    child.stderr?.on('data', (chunk) => runLogs.push(...String(chunk).split(/\r?\n/).filter(Boolean)));
    child.on('exit', () => {
      bridgeRun = null;
    });
  }

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await bridgeHealthy()) {
      runLogs.push('[Dashboard] OpenClaw bridge is healthy.');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error('OpenClaw bridge did not become healthy within 15 seconds.');
}

function tryParseOpenClawResult(stdout: string) {
  try {
    const json = JSON.parse(stdout);
    const text = json?.payloads?.[0]?.text ?? json?.meta?.finalAssistantVisibleText ?? null;
    return {
      text,
      model: json?.meta?.agentMeta?.model,
      provider: json?.meta?.agentMeta?.provider,
      toolSummary: json?.meta?.toolSummary,
      durationMs: json?.meta?.durationMs,
      sessionFile: json?.meta?.agentMeta?.sessionFile,
    };
  } catch {
    return null;
  }
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(DASHBOARD_DIR));
app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules/three/build')));

app.get('/api/cockpit', async (_req, res) => {
  const sponsorDeals = await readJson<Record<string, any>>(path.join(CACHE_DIR, 'sponsor_deals.json'), {});
  const communityDeals = await readJson<Record<string, any>>(path.join(CACHE_DIR, 'community_deals.json'), {});
  const redteam = await readJson(path.join(CACHE_DIR, 'redteam-result.json'), null);
  const badcase = await readJson(path.join(CACHE_DIR, 'badcase-result.json'), null);
  const runState = await readJson(RUN_STATE_FILE, null);
  const sponsorMemory = await readJson(path.join(CACHE_DIR, 'sponsor_memory.json'), null);
  const communityMemory = await readJson(path.join(CACHE_DIR, 'community_memory.json'), null);
  const mem9 = await memoryService.mem9Status();
  const doku = await dokuService.status();
  const mandates = await loadConfiguredMandates();
  const theater = await readJson(path.join(CACHE_DIR, 'two-agent-theater-state.json'), null);
  const proofs = await listProofs();
  const payments = await listPayments();
  const deals = [
    ...Object.values(sponsorDeals).map((deal: any) => ({ ...deal, perspective: 'sponsor' })),
    ...Object.values(communityDeals).map((deal: any) => ({ ...deal, perspective: 'community' })),
  ].sort((a: any, b: any) => b.updatedAt - a.updatedAt);

  const checks = deals.flatMap((deal: any) => deal.policyTrail ?? []).flatMap((decision: any) => decision.checks ?? []);
  const failedChecks = checks.filter((check: any) => !check.passed);
  const latestPayment = [...payments].sort((a: any, b: any) => Number(b.generatedAt ?? 0) - Number(a.generatedAt ?? 0))[0] as any;
  const narrativeDeal = deals.find((deal: any) => deal.escrowId === latestPayment?.escrowId)
    ?? deals.find((deal: any) => deal.terms)
    ?? deals[0];

  res.json({
    generatedAt: Date.now(),
    stats: {
      deals: deals.length,
      proofs: proofs.length,
      payments: payments.length,
      policyChecks: checks.length,
      decisionReceipts: deals.flatMap((deal: any) => deal.decisionReceipts ?? []).length,
      failedChecks: failedChecks.length,
    },
    deals,
    proofs,
    payments,
    redteam,
    badcase,
    runState,
    narrative: buildNarrative(narrativeDeal, latestPayment, runState),
    memory: {
      sponsor: sponsorMemory,
      community: communityMemory,
      mem9,
    },
    doku,
    delivery: {
      discordConfigured: Boolean(
        process.env.COMMUNITY_DISCORD_BOT_TOKEN
        && process.env.SPONSOR_DISCORD_BOT_TOKEN
        && process.env.DEMO_DISCORD_GUILD_ID
        && process.env.DEMO_DISCORD_CHANNEL_ID,
      ),
      guildId: process.env.DEMO_DISCORD_GUILD_ID || null,
      channelId: process.env.DEMO_DISCORD_CHANNEL_ID || null,
    },
    mandates: {
      sponsor: mandates.sponsorSnapshot ?? {
        role: 'sponsor',
        wallet: process.env.SPONSOR_WALLET_ADDRESS || 'local-sponsor-wallet',
        mandate: mandates.sponsorMandate,
        updatedAt: null,
      },
      community: mandates.communitySnapshot ?? {
        role: 'community',
        wallet: process.env.COMMUNITY_WALLET_ADDRESS || 'local-community-wallet',
        mandate: mandates.communityMandate,
        updatedAt: null,
      },
    },
    theater,
  });
});

app.post('/api/mandates', async (req, res) => {
  try {
    const saved = await saveConfiguredMandates(req.body ?? {});
    res.json({ ok: true, mandates: saved });
  } catch (error: any) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/api/doku/checkout', async (req, res) => {
  try {
    const amountUsd = Number(req.body?.amountUsd ?? 1);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      res.status(400).json({ ok: false, error: 'amountUsd must be a positive number.' });
      return;
    }

    const result = await dokuService.createCheckout({
      amountUsd,
      description: String(req.body?.description || 'AdSourcing sponsor checkout'),
      sponsorWallet: String(req.body?.sponsorWallet || process.env.SPONSOR_WALLET_ADDRESS || ''),
      communityWallet: String(req.body?.communityWallet || process.env.COMMUNITY_WALLET_ADDRESS || ''),
    });
    const status = await dokuService.status();
    res.status(result.ok ? 200 : 502).json({ ok: result.ok, checkout: result, doku: status });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/intake', async (req, res) => {
  try {
    const role = req.body?.role === 'community' ? 'community' : 'sponsor';
    const text = String(req.body?.text ?? '').trim();
    if (!text) {
      res.status(400).json({ ok: false, error: 'Text is required.' });
      return;
    }
    const current = await loadConfiguredMandates();
    const parsed = await extractMandateWithGemini(role, text, role === 'sponsor' ? current.sponsorMandate : current.communityMandate);
    res.json({ ok: true, ...parsed });
  } catch (error: any) {
    res.status(502).json({ ok: false, error: error.message });
  }
});

async function extractMandateWithGemini(role: 'sponsor' | 'community', text: string, currentMandate: unknown) {
  const env = await loadFreshEnv();
  const apiKey = env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('No GOOGLE_API_KEY found. Please set it in the .env file.');
  const model = String(env.ADSOURCING_INTAKE_MODEL || 'gemini-3-flash-preview');
  
  const schema = role === 'sponsor'
    ? {
      campaignName: 'string',
      budgetUsdc: 'number or null',
      maxPricePerPostUsdc: 'number or null',
      minMemberCount: 'number or null',
      minReputationScore: 'number or null',
      contentPolicy: 'string',
      adCopy: 'string',
      missingCritical: 'array of missing critical fields',
      reply: 'short conversational reply to the user',
    }
    : {
      platform: 'discord or telegram',
      memberCount: 'number or null',
      priceFloorUsdc: 'number or null',
      minSponsorScore: 'number or null',
      maxAdsPerDay: 'number or null',
      contentRulesText: 'semicolon-separated string',
      guildId: 'string or null',
      channelId: 'string or null',
      missingCritical: 'array of missing critical fields',
      reply: 'short conversational reply to the user',
    };

  const systemPrompt = [
    'You extract AdSourcing agent mandates from casual user chat.',
    'Return strict JSON only. No markdown.',
    'Use null for important numeric fields the user did not provide.',
    'Use the current mandate only as fallback/default context, but missingCritical must list missing fields that are unsafe to infer.',
    role === 'sponsor'
      ? 'For sponsor, critical fields are budgetUsdc and maxPricePerPostUsdc. Safe defaults: minMemberCount 300, minReputationScore 70, policy no gambling/no scams/no guaranteed returns.'
      : 'For community, critical field is priceFloorUsdc. Safe defaults: platform discord, minSponsorScore 70, maxAdsPerDay 3, rules no gambling/no scams/no guaranteed returns.',
    `JSON shape: ${JSON.stringify(schema)}`,
  ].join('\n');

  const userMessage = JSON.stringify({ role, text, currentMandate });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userMessage }] }
      ],
      generationConfig: {
        temperature: 0.1
      }
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || `Gemini intake failed with HTTP ${response.status}`);
  }
  
  const content = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Gemini intake returned no message content.');
  
  const parsed = parseJsonFromText(content);
  return {
    source: 'gemini',
    model,
    parsed,
    reply: typeof parsed.reply === 'string' ? parsed.reply : null,
  };
}

function parseJsonFromText(text: string) {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('GLM intake did not return parseable JSON.');
  }
}

function buildNarrative(deal: any, payment: any, runState: any) {
  const accepted = deal?.lastResponse?.type === 'ACCEPT' || deal?.phase === 'AGREED' || deal?.phase === 'SETTLED' || payment?.status === 'SETTLED';
  return {
    headline: payment?.status === 'SETTLED'
      ? 'Sponsor paid, community delivered, escrow settled.'
      : accepted
        ? 'Agents reached terms and are waiting for settlement evidence.'
        : runState?.status === 'running'
          ? 'Agents are running now.'
          : 'No completed agent transaction selected.',
    sponsor: {
      role: 'Sponsor / advertiser',
      wallet: deal?.sponsorWallet,
      maxBudgetUsdc: 40,
      offerUsdc: deal?.lastOffer?.offeredPriceUsdc ?? payment?.amountUsdc,
    },
    community: {
      role: 'Community / Discord owner',
      wallet: deal?.communityWallet,
      floorUsdc: 25,
      decision: deal?.lastResponse?.type,
    },
    escrow: {
      escrowId: payment?.escrowId ?? deal?.escrowId,
      amountUsdc: payment?.amountUsdc ?? deal?.terms?.priceUsdc,
      status: payment?.status ?? deal?.phase,
      communityPayoutUsdc: payment?.communityPayoutUsdc,
      protocolFeeUsdc: payment?.protocolFeeUsdc,
      txHashes: payment?.txHashes ?? deal?.txHashes ?? [],
    },
    proof: {
      deliveryProof: deal?.deliveryProof,
      proofHash: payment?.proofHash,
      receiptId: payment?.receiptId,
    },
  };
}

app.post('/api/run/agenthon-local', async (req, res) => {
  if (activeRun || activeSequence) {
    res.status(409).json({ ok: false, error: 'Agenthon local run already in progress.' });
    return;
  }

  const allowLocalDelivery = req.query.localDelivery !== 'false';
  const mode = allowLocalDelivery ? 'local-delivery' : 'discord-delivery';
  const startedAt = Date.now();
  const runLogs = [`[Dashboard] Starting Agenthon local mode at ${new Date(startedAt).toLocaleTimeString()}`];
  await writeRunState({
    status: 'running',
    command: 'npm run agenthon:local',
    mode,
    startedAt,
    exitCode: null,
    openclawResult: null,
    theaterResult: null,
    logs: runLogs,
  });

  const run = spawn('npm', ['run', 'agenthon:local'], {
    cwd: ROOT,
    env: {
      ...process.env,
      AGENTHON_ALLOW_LOCAL_DELIVERY: allowLocalDelivery ? 'true' : 'false',
    },
    shell: true,
    windowsHide: true,
  });
  activeRun = run;

  const appendLog = async (chunk: Buffer) => {
    const lines = String(chunk).split(/\r?\n/).filter(Boolean);
    runLogs.push(...lines);
    await writeRunState({ logs: runLogs.slice(-260) });
  };

  run.stdout.on('data', appendLog);
  run.stderr.on('data', appendLog);
  run.on('exit', async (code) => {
    runLogs.push(`[Dashboard] Agenthon local exited with code ${code}.`);
    await writeRunState({
      status: code === 0 ? 'completed' : 'failed',
      mode,
      exitCode: code,
      finishedAt: Date.now(),
      logs: runLogs.slice(-260),
    });
    activeRun = null;
  });

  res.json({ ok: true, startedAt, mode: allowLocalDelivery ? 'local-delivery' : 'discord-delivery' });
});

app.post('/api/run/openclaw-gemini', async (req, res) => {
  if (activeRun || activeSequence) {
    res.status(409).json({ ok: false, error: 'A run is already in progress.' });
    return;
  }

  const allowLocalDelivery = req.query.localDelivery !== 'false';
  const model = String(req.query.model ?? DEFAULT_OPENCLAW_MODEL);
  const startedAt = Date.now();
  const runLogs = [
    `[Dashboard] Starting OpenClaw LLM agent at ${new Date(startedAt).toLocaleTimeString()}`,
    `[Dashboard] Model: ${model}`,
  ];

  await writeRunState({
    status: 'running',
    command: 'openclaw agent --local',
    mode: allowLocalDelivery ? 'openclaw-llm-local-delivery' : 'openclaw-llm-discord-delivery',
    model,
    startedAt,
    exitCode: null,
    openclawResult: null,
    theaterResult: null,
    logs: runLogs,
  });

  res.json({ ok: true, startedAt, mode: 'openclaw-llm', model });

  try {
    await ensureOpenClawBridge(runLogs);
    await writeRunState({ logs: runLogs.slice(-260) });

    const sessionId = `adsourcing-dashboard-${startedAt}`;
    const message = [
      `Call the tool adsourcing_run_agenthon_local with allowLocalDelivery ${allowLocalDelivery ? 'true' : 'false'}.`,
      'After it returns, summarize only these fields: whether SponsorAgent and CommunityAgent interacted, escrow amount, settlement status, receipt id, proof id, and tx hashes.',
      'Do not inspect files or run shell.',
    ].join(' ');

    const args = [
      'agent',
      '--local',
      '--model',
      model,
      '--session-id',
      sessionId,
      '--message',
      message,
      '--json',
      '--timeout',
      '300',
    ];
    const env = await loadFreshEnv();
    const openclaw = openClawProcess(env, args);
    runLogs.push(`[Dashboard] Launching: ${openclaw.display.replace(message, '<agent prompt>')}`);
    await writeRunState({ logs: runLogs.slice(-260) });

    const run = spawn(openclaw.command, openclaw.args, {
      cwd: ROOT,
      env,
      windowsHide: true,
    });
    activeRun = run;
    let stdout = '';
    let stderr = '';
    runLogs.push('[Dashboard] OpenClaw process started. Waiting for Gemini to call the AdSourcing tool...');
    await writeRunState({ logs: runLogs.slice(-260) });

    const appendLog = async (chunk: Buffer, source: 'stdout' | 'stderr') => {
      const text = String(chunk);
      if (source === 'stdout') {
        stdout += text;
        await writeRunState({ logs: runLogs.slice(-260) });
        return;
      }

      stderr += text;
      const lines = text
        .split(/\r?\n/)
        .filter(Boolean)
        .filter((line) =>
          line.includes('embedded run agent end')
          || line.includes('model fallback decision')
          || line.includes('toolSummary')
          || line.includes('adsourcing_run_agenthon_local'),
        );
      runLogs.push(...lines);
      await writeRunState({ logs: runLogs.slice(-260) });
    };

    run.stdout.on('data', (chunk) => appendLog(chunk, 'stdout'));
    run.stderr.on('data', (chunk) => appendLog(chunk, 'stderr'));
    run.on('error', async (error) => {
      runLogs.push(`[Dashboard] Could not start OpenClaw: ${error.message}`);
      await writeRunState({
        status: 'failed',
        exitCode: 1,
        finishedAt: Date.now(),
        logs: runLogs.slice(-260),
      });
      activeRun = null;
    });
    run.on('exit', async (code) => {
      const openclawResult = tryParseOpenClawResult(stdout);
      const verifiedEvidence = await latestVerifiedEvidence();
      if (code !== 0 && stderr.trim()) {
        runLogs.push('[Dashboard] OpenClaw stderr:');
        runLogs.push(...stderr.split(/\r?\n/).filter(Boolean).slice(-20));
      }
      if (openclawResult?.text) {
        runLogs.push('[Dashboard] OpenClaw final summary:');
        runLogs.push(openclawResult.text);
      }
      runLogs.push(`[Dashboard] OpenClaw LLM run exited with code ${code}.`);
      await writeRunState({
        status: code === 0 ? 'completed' : 'failed',
        exitCode: code,
        finishedAt: Date.now(),
        openclawResult: openclawResult ? { ...openclawResult, verifiedEvidence } : { verifiedEvidence },
        theaterResult: null,
        logs: runLogs.slice(-260),
      });
      activeRun = null;
    });
  } catch (error: any) {
    runLogs.push(`[Dashboard] OpenClaw LLM run failed before launch: ${error.message}`);
    await writeRunState({
      status: 'failed',
      exitCode: 1,
      finishedAt: Date.now(),
      logs: runLogs.slice(-260),
    });
    activeRun = null;
  }
});

async function runOpenClawCliStep(options: {
  command: string[];
  runLogs: string[];
  label: string;
}) {
  const env = await loadFreshEnv();
  const openclaw = openClawProcess(env, options.command);
  options.runLogs.push(`[OpenClaw ${options.label}] ${openclaw.display}`);
  await writeRunState({ logs: options.runLogs.slice(-260) });

  return new Promise<string>((resolve, reject) => {
    const run = spawn(openclaw.command, openclaw.args, {
      cwd: ROOT,
      env,
      windowsHide: true,
    });
    activeRun = run;
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      options.runLogs.push(`[OpenClaw ${options.label}] CLI step timed out after 45s; stopping.`);
      void writeRunState({ logs: options.runLogs.slice(-260) });
      run.kill();
    }, 45000);

    run.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    run.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    run.on('error', (error) => {
      clearTimeout(timeout);
      activeRun = null;
      reject(error);
    });

    run.on('exit', (code) => {
      clearTimeout(timeout);
      activeRun = null;
      if (stderr.trim()) {
        options.runLogs.push(...stderr.split(/\r?\n/).filter(Boolean).slice(-4).map((line) => `[OpenClaw ${options.label}] ${line}`));
      }
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`OpenClaw ${options.label} CLI step exited with code ${code}.`));
      }
    });
  });
}

async function runOpenClawPrompt(options: {
  model: string;
  sessionId: string;
  message: string;
  runLogs: string[];
  label: string;
}) {
  const args = [
    'agent',
    '--local',
    '--model',
    options.model,
    '--session-id',
    options.sessionId,
    '--message',
    options.message,
    '--json',
    '--timeout',
    '90',
  ];

  options.runLogs.push(`[OpenClaw ${options.label}] Launching session ${options.sessionId}.`);
  await writeRunState({ logs: options.runLogs.slice(-260) });
  const env = await loadFreshEnv();
  const openclaw = openClawProcess(env, args);

  return new Promise<any>((resolve, reject) => {
    const run = spawn(openclaw.command, openclaw.args, {
      cwd: ROOT,
      env,
      windowsHide: true,
    });
    activeRun = run;
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      options.runLogs.push(`[OpenClaw ${options.label}] timed out after 90s; stopping this role session.`);
      void writeRunState({ logs: options.runLogs.slice(-260) });
      run.kill();
    }, 90000);

    run.stdout.on('data', async (chunk) => {
      stdout += String(chunk);
      await writeRunState({ logs: options.runLogs.slice(-260) });
    });

    run.stderr.on('data', async (chunk) => {
      const text = String(chunk);
      stderr += text;
      const lines = text
        .split(/\r?\n/)
        .filter(Boolean)
        .filter((line) =>
          line.includes('embedded run agent end')
          || line.includes('model fallback decision')
          || line.includes('toolSummary')
          || line.includes('adsourcing_'),
        );
      if (lines.length) {
        options.runLogs.push(...lines.map((line) => `[OpenClaw ${options.label}] ${line}`));
        await writeRunState({ logs: options.runLogs.slice(-260) });
      }
    });

    run.on('error', (error) => {
      clearTimeout(timeout);
      activeRun = null;
      reject(error);
    });

    run.on('exit', (code) => {
      clearTimeout(timeout);
      activeRun = null;
      const result = tryParseOpenClawResult(stdout);
      if (result?.text) {
        options.runLogs.push(`[OpenClaw ${options.label}] Summary:`);
        options.runLogs.push(result.text);
      }
      options.runLogs.push(`[OpenClaw ${options.label}] exited with code ${code}.`);
      if (code === 0) {
        resolve(result ?? { stdout, stderr });
      } else {
        reject(new Error(`OpenClaw ${options.label} exited with code ${code}.`));
      }
    });
  });
}

app.post('/api/run/openclaw-duel', async (req, res) => {
  if (activeRun || activeSequence) {
    res.status(409).json({ ok: false, error: 'A run is already in progress.' });
    return;
  }

  const allowLocalDelivery = req.query.localDelivery !== 'false';
  const model = String(req.query.model ?? DEFAULT_OPENCLAW_MODEL);
  const startedAt = Date.now();
  const runLogs = [
    `[Dashboard] Starting OpenClaw CLI duel at ${new Date(startedAt).toLocaleTimeString()}`,
    `[Dashboard] Model available for LLM mode: ${model}`,
    `[Dashboard] Mode: ${allowLocalDelivery ? 'local delivery' : 'Discord delivery'}`,
  ];

  activeSequence = true;
  await writeRunState({
    status: 'running',
    command: 'openclaw adsourcing step commands, alternating sponsor/community roles',
    mode: allowLocalDelivery ? 'openclaw-duel-local-delivery' : 'openclaw-duel-discord-delivery',
    model,
    startedAt,
    exitCode: null,
    openclawResult: null,
    theaterResult: null,
    logs: runLogs,
  });

  res.json({ ok: true, startedAt, mode: 'openclaw-duel', model });

  void (async () => {
    try {
      await ensureOpenClawBridge(runLogs);
      runLogs.push('[SYSTEM POV] openclaw adsourcing reset');
      await runOpenClawCliStep({
        command: allowLocalDelivery ? ['adsourcing', 'reset'] : ['adsourcing', 'reset', '--discord'],
        runLogs,
        label: 'System',
      });
      let theaterResult = await callBridgeTool('adsourcing_theater_status', {});
      const resetEvent = theaterResult?.events?.[theaterResult.events.length - 1];
      if (resetEvent) runLogs.push(`[${resetEvent.actor.toUpperCase()}] ${resetEvent.title}: ${resetEvent.detail}`);
      await writeRunState({ logs: runLogs.slice(-260), theaterResult });

      const steps = [
        {
          role: 'Sponsor',
          tool: 'adsourcing_sponsor_broadcast',
          command: ['adsourcing', 'sponsor-broadcast'],
        },
        {
          role: 'Community',
          tool: 'adsourcing_community_handshake',
          command: ['adsourcing', 'community-handshake'],
        },
        {
          role: 'Sponsor',
          tool: 'adsourcing_sponsor_offer',
          command: ['adsourcing', 'sponsor-offer'],
        },
        {
          role: 'Community',
          tool: 'adsourcing_community_decide',
          command: ['adsourcing', 'community-decide'],
        },
        {
          role: 'Sponsor',
          tool: 'adsourcing_sponsor_fund',
          command: ['adsourcing', 'sponsor-fund'],
        },
        {
          role: 'Community',
          tool: 'adsourcing_community_deliver',
          command: ['adsourcing', 'community-deliver'],
        },
        {
          role: 'Sponsor',
          tool: 'adsourcing_sponsor_settle',
          command: ['adsourcing', 'sponsor-settle'],
        },
      ];

      const results = [];
      for (const [index, step] of steps.entries()) {
        runLogs.push(`[OpenClaw ${step.role.toUpperCase()} POV] openclaw ${step.command.join(' ')}`);
        await writeRunState({ logs: runLogs.slice(-260), theaterResult });
        const result = await runOpenClawCliStep({
          command: step.command,
          runLogs,
          label: step.role,
        });
        results.push({ role: step.role, tool: step.tool, result: result.slice(0, 2000) });
        theaterResult = await callBridgeTool('adsourcing_theater_status', {});
        const lastEvent = theaterResult?.events?.[theaterResult.events.length - 1];
        if (lastEvent) runLogs.push(`[${lastEvent.actor.toUpperCase()}] ${lastEvent.title}: ${lastEvent.detail}`);
        await writeRunState({ logs: runLogs.slice(-260), theaterResult, openclawResult: { text: `${results.length} OpenClaw step sessions completed.`, toolSummary: { calls: results.length, failures: 0 } } });
      }

      runLogs.push('[Dashboard] Two-OpenClaw duel completed.');
      await writeRunState({
        status: 'completed',
        exitCode: 0,
        finishedAt: Date.now(),
        theaterResult,
        openclawResult: {
          text: `Two OpenClaw roles completed ${results.length} step tool calls: Sponsor and Community alternated from intent through settlement.`,
          model: 'openclaw-plugin-cli',
          provider: 'openclaw',
          toolSummary: { calls: results.length, failures: 0 },
        },
        logs: runLogs.slice(-260),
      });
    } catch (error: any) {
      runLogs.push(`[Dashboard] Two-OpenClaw duel failed: ${error.message}`);
      await writeRunState({
        status: 'failed',
        exitCode: 1,
        finishedAt: Date.now(),
        logs: runLogs.slice(-260),
      });
    } finally {
      activeRun = null;
      activeSequence = false;
    }
  })();
});

app.post('/api/run/badcase', async (_req, res) => {
  if (activeRun || activeSequence) {
    res.status(409).json({ ok: false, error: 'A run is already in progress.' });
    return;
  }

  const startedAt = Date.now();
  const runLogs = [`[Dashboard] Starting rejection case at ${new Date(startedAt).toLocaleTimeString()}`];
  await writeRunState({
    status: 'running',
    command: 'npm run badcase',
    mode: 'guardrail-rejection',
    startedAt,
    exitCode: null,
    logs: runLogs,
  });

  const run = spawn('npm', ['run', 'badcase'], {
    cwd: ROOT,
    env: await loadFreshEnv(),
    shell: true,
    windowsHide: true,
  });
  activeRun = run;

  const appendLog = async (chunk: Buffer) => {
    const lines = String(chunk).split(/\r?\n/).filter(Boolean);
    runLogs.push(...lines);
    await writeRunState({ logs: runLogs.slice(-260) });
  };

  run.stdout.on('data', appendLog);
  run.stderr.on('data', appendLog);
  run.on('exit', async (code) => {
    runLogs.push(`[Dashboard] Rejection case exited with code ${code}.`);
    await writeRunState({
      status: code === 0 ? 'completed' : 'failed',
      mode: 'guardrail-rejection',
      exitCode: code,
      finishedAt: Date.now(),
      logs: runLogs.slice(-260),
    });
    activeRun = null;
  });

  res.json({ ok: true, startedAt, mode: 'guardrail-rejection' });
});

app.post('/api/run/two-agent-theater', async (req, res) => {
  if (activeRun || activeSequence) {
    res.status(409).json({ ok: false, error: 'A run is already in progress.' });
    return;
  }

  const allowLocalDelivery = req.query.localDelivery !== 'false';
  const startedAt = Date.now();
  const runLogs = [
    `[Dashboard] Starting two-agent theater at ${new Date(startedAt).toLocaleTimeString()}`,
    `[Dashboard] Mode: ${allowLocalDelivery ? 'local delivery' : 'Discord delivery'}`,
  ];

  await writeRunState({
    status: 'running',
    command: 'adsourcing two-agent theater',
    mode: allowLocalDelivery ? 'two-agent-theater-local-delivery' : 'two-agent-theater-discord-delivery',
    startedAt,
    exitCode: null,
    logs: runLogs,
  });

  res.json({ ok: true, startedAt, mode: 'two-agent-theater' });

  void (async () => {
    try {
      await ensureOpenClawBridge(runLogs);
      const steps: Array<[string, string, Record<string, unknown>]> = [
        ['system', 'adsourcing_theater_reset', { allowLocalDelivery }],
        ['sponsor', 'adsourcing_sponsor_broadcast', {}],
        ['community', 'adsourcing_community_handshake', {}],
        ['sponsor', 'adsourcing_sponsor_offer', {}],
        ['community', 'adsourcing_community_decide', {}],
        ['sponsor', 'adsourcing_sponsor_fund', {}],
        ['community', 'adsourcing_community_deliver', {}],
        ['sponsor', 'adsourcing_sponsor_settle', {}],
      ];

      let finalResult: any = null;
      for (const [actor, toolName, params] of steps) {
        runLogs.push(`[${actor.toUpperCase()} POV] ${toolName}`);
        finalResult = await callBridgeTool(toolName, params);
        const lastEvent = finalResult?.events?.[finalResult.events.length - 1];
        if (lastEvent) runLogs.push(`[${lastEvent.actor.toUpperCase()}] ${lastEvent.title}: ${lastEvent.detail}`);
        await writeRunState({ logs: runLogs.slice(-260), theaterResult: finalResult });
      }

      runLogs.push('[Dashboard] Two-agent theater completed.');
      await writeRunState({
        status: 'completed',
        exitCode: 0,
        finishedAt: Date.now(),
        theaterResult: finalResult,
        logs: runLogs.slice(-260),
      });
    } catch (error: any) {
      runLogs.push(`[Dashboard] Two-agent theater failed: ${error.message}`);
      await writeRunState({
        status: 'failed',
        exitCode: 1,
        finishedAt: Date.now(),
        logs: runLogs.slice(-260),
      });
    }
  })();
});

async function callBridgeTool(toolName: string, params: Record<string, unknown>) {
  const response = await fetch(`http://127.0.0.1:4020/openclaw/tools/${toolName}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  const body = await response.json();
  if (!response.ok || body.ok === false) {
    throw new Error(body.error || `Bridge tool failed: ${toolName}`);
  }
  return body.result;
}

app.listen(PORT, () => {
  console.log(`[Dashboard] Evidence cockpit listening on http://localhost:${PORT}`);
});
