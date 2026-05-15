import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

type ListedModel = {
  name: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
};

const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
const explicitModels = process.argv.slice(2);
const defaultModels = [
  process.env.ADSOURCING_LLM_MODEL,
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemma-4-26b-a4b-it',
  'gemma-4-31b-it',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.5-flash-lite',
].filter((model): model is string => Boolean(model));

function normalizeModelName(name: string): string {
  return name.startsWith('models/') ? name.slice('models/'.length) : name;
}

function shortError(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
    .replace(/\s+/g, ' ')
    .slice(0, 700);
}

async function listGenerateModels(): Promise<ListedModel[]> {
  if (!apiKey) {
    return [];
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
  );
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body?.error?.message ?? `Google model list failed with HTTP ${response.status}`);
  }

  return ((body.models ?? []) as ListedModel[]).filter((model) =>
    model.supportedGenerationMethods?.includes('generateContent'),
  );
}

async function probeModel(name: string): Promise<boolean> {
  if (!apiKey) {
    throw new Error('Set GOOGLE_API_KEY or GEMINI_API_KEY in .env first.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: normalizeModelName(name) });
  const result = await model.generateContent('Reply with exactly: ADSOURCING_MODEL_OK');
  const text = result.response.text().trim();
  console.log(`${name}: OK ${text.slice(0, 120)}`);
  return true;
}

async function main() {
  if (!apiKey) {
    console.error('No GOOGLE_API_KEY or GEMINI_API_KEY found in .env.');
    process.exitCode = 1;
    return;
  }

  const listed = await listGenerateModels();
  console.log(`Google key can list ${listed.length} generateContent model(s).`);
  console.log(
    listed
      .slice(0, 12)
      .map((model) => `- ${normalizeModelName(model.name)} (${model.displayName ?? 'unnamed'})`)
      .join('\n'),
  );

  const candidates = [...new Set(explicitModels.length > 0 ? explicitModels : defaultModels)];
  console.log(`\nProbing ${candidates.length} candidate model(s): ${candidates.join(', ')}`);

  for (const candidate of candidates) {
    try {
      await probeModel(candidate);
      console.log(`Usable model: ${candidate}`);
      return;
    } catch (error) {
      const message = shortError(error);
      console.log(`${candidate}: FAIL ${message}`);
      if (message.includes('429 Too Many Requests') || message.toLowerCase().includes('quota')) {
        console.log('Stopping probe because this key is quota-limited right now.');
        process.exitCode = 2;
        return;
      }
    }
  }

  process.exitCode = 2;
}

main().catch((error) => {
  console.error(shortError(error));
  process.exitCode = 1;
});
