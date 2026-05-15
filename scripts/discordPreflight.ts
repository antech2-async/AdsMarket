import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

type Check = {
  id: string;
  ok: boolean;
  detail: string;
  suggestion?: string;
};

const DISCORD_API = 'https://discord.com/api/v10';
const writeMode = process.argv.includes('--write');

function filled(value: string | undefined): value is string {
  return Boolean(value && value.trim() && !value.includes('...'));
}

async function discordGet(token: string, route: string) {
  const response = await fetch(`${DISCORD_API}${route}`, {
    headers: { authorization: `Bot ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message ? `${response.status} ${body.message}` : `HTTP ${response.status}`);
  }
  return body;
}

async function botCheck(label: string, envName: string): Promise<{ check: Check; id?: string }> {
  const token = process.env[envName];
  if (!filled(token)) {
    return {
      check: {
        id: `discord.${label}.token`,
        ok: false,
        detail: `${envName} is missing or blank.`,
      },
    };
  }

  try {
    const bot = await discordGet(token, '/users/@me');
    return {
      id: String(bot.id),
      check: {
        id: `discord.${label}.token`,
        ok: true,
        detail: `${envName} is valid for bot ${bot.username}#${bot.discriminator ?? '0'} (${bot.id}).`,
      },
    };
  } catch (error) {
    return {
      check: {
        id: `discord.${label}.token`,
        ok: false,
        detail: `${envName} could not authenticate: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

async function channelCheck(token: string | undefined): Promise<{ check: Check; guildId?: string }> {
  const channelId = process.env.DEMO_DISCORD_CHANNEL_ID;
  if (!filled(channelId)) {
    return {
      check: {
        id: 'discord.channel',
        ok: false,
        detail: 'DEMO_DISCORD_CHANNEL_ID is missing or blank.',
      },
    };
  }
  if (!filled(token)) {
    return {
      check: {
        id: 'discord.channel',
        ok: false,
        detail: 'Cannot validate channel until at least one Discord bot token is set.',
      },
    };
  }

  try {
    const channel = await discordGet(token, `/channels/${channelId}`);
    const guildId = channel.guild_id ? String(channel.guild_id) : undefined;
    const configuredGuild = process.env.DEMO_DISCORD_GUILD_ID;
    const guildMatches = !filled(configuredGuild) || !guildId || configuredGuild === guildId;
    return {
      guildId,
      check: {
        id: 'discord.channel',
        ok: guildMatches,
        detail: guildMatches
          ? `Channel ${channel.name ?? channel.id} is visible. guild_id=${guildId ?? 'n/a'}.`
          : `Channel guild_id=${guildId}; DEMO_DISCORD_GUILD_ID=${configuredGuild}.`,
        suggestion: guildId && !filled(configuredGuild) ? `DEMO_DISCORD_GUILD_ID=${guildId}` : undefined,
      },
    };
  } catch (error) {
    return {
      check: {
        id: 'discord.channel',
        ok: false,
        detail: `Channel could not be read: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

async function updateEnv(values: Record<string, string>) {
  const envPath = path.resolve('.env');
  let text = await fs.readFile(envPath, 'utf-8');
  for (const [key, value] of Object.entries(values)) {
    if (!value) continue;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    if (pattern.test(text)) {
      text = text.replace(pattern, `${key}=${value}`);
    } else {
      text += `${text.endsWith('\n') ? '' : '\n'}${key}=${value}\n`;
    }
  }
  await fs.writeFile(envPath, text, 'utf-8');
}

async function main() {
  const checks: Check[] = [];
  const derived: Record<string, string> = {};

  const community = await botCheck('community', 'COMMUNITY_DISCORD_BOT_TOKEN');
  const sponsor = await botCheck('sponsor', 'SPONSOR_DISCORD_BOT_TOKEN');
  checks.push(community.check, sponsor.check);

  if (community.id) {
    const configured = process.env.COMMUNITY_DISCORD_BOT_USER_ID;
    const ok = !filled(configured) || configured === community.id;
    checks.push({
      id: 'discord.communityBotUserId',
      ok,
      detail: ok
        ? `Community bot user id ${community.id}${filled(configured) ? ' matches .env.' : ' can be written to .env.'}`
        : `COMMUNITY_DISCORD_BOT_USER_ID=${configured}, but token belongs to ${community.id}.`,
      suggestion: `COMMUNITY_DISCORD_BOT_USER_ID=${community.id}`,
    });
    if (!filled(configured)) derived.COMMUNITY_DISCORD_BOT_USER_ID = community.id;
  }

  const channel = await channelCheck(process.env.SPONSOR_DISCORD_BOT_TOKEN || process.env.COMMUNITY_DISCORD_BOT_TOKEN);
  checks.push(channel.check);
  if (channel.guildId && !filled(process.env.DEMO_DISCORD_GUILD_ID)) {
    derived.DEMO_DISCORD_GUILD_ID = channel.guildId;
  }

  const ok = checks.every((check) => check.ok);
  console.log('\n====== DISCORD PREFLIGHT ======\n');
  for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.id}: ${check.detail}`);
    if (check.suggestion) console.log(`  suggested: ${check.suggestion}`);
  }

  if (Object.keys(derived).length > 0) {
    if (writeMode) {
      await updateEnv(derived);
      console.log('\nUpdated .env with derived non-secret Discord IDs.');
    } else {
      console.log('\nRun with -- --write to write derived non-secret IDs to .env.');
    }
  }

  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
