import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

const EMPTY = { type: "object", additionalProperties: false, properties: {} };
const MANDATE_PARAMS = {
  type: "object",
  additionalProperties: false,
  required: ["wallet", "mandate"],
  properties: {
    wallet: { type: "string" },
    agentId: { type: "string" },
    mandate: { type: "object" },
  },
};

function resolveBridgeUrl(configOrPluginConfig) {
  const pluginConfig =
    configOrPluginConfig?.plugins?.entries?.adsourcing?.config || configOrPluginConfig || {};
  return (
    (typeof pluginConfig.bridgeUrl === "string" && pluginConfig.bridgeUrl) ||
    "http://localhost:4020/openclaw"
  );
}

async function callBridge(bridgeUrl, toolName, params = {}) {
  const response = await fetch(`${bridgeUrl}/tools/${toolName}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = await response.json();
  if (!response.ok || body.ok === false) {
    throw new Error(body.error || `AdSourcing bridge failed for ${toolName}`);
  }
  return body.result;
}

export default definePluginEntry({
  id: "adsourcing",
  name: "AdSourcing Agent Tools",
  description: "OpenClaw tools for accountable micro-sponsorship agents.",
  register(api) {
    const bridgeUrl = resolveBridgeUrl(api.pluginConfig);

    for (const tool of [
      {
        name: "adsourcing_status",
        description: "Inspect AdSourcing mandates, deal memory, decision receipts, proof bundles, and payment receipts.",
        parameters: EMPTY,
      },
      {
        name: "adsourcing_run_happy_path",
        description: "Run the full agent loop: mandate, negotiation, escrow, delivery, verification, proof, and settlement receipt.",
        parameters: EMPTY,
      },
      {
        name: "adsourcing_run_bad_case",
        description: "Run the malicious-content guardrail demo where the agent rejects before escrow.",
        parameters: EMPTY,
      },
      {
        name: "adsourcing_run_agenthon_local",
        description: "Run Agenthon local mode: local funded chain, real contracts, signed agents, optional Discord bot delivery, proof/payment receipts.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            allowLocalDelivery: { type: "boolean" },
          },
        },
      },
      {
        name: "adsourcing_save_sponsor_mandate",
        description: "Persist a sponsor mandate that the Sponsor Agent can execute under.",
        parameters: MANDATE_PARAMS,
      },
      {
        name: "adsourcing_save_community_mandate",
        description: "Persist a community mandate that the Community Agent can execute under.",
        parameters: MANDATE_PARAMS,
      },
      {
        name: "adsourcing_get_evidence",
        description: "Return recent proof bundles and payment receipts.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: { limit: { type: "number" } },
        },
      },
      {
        name: "adsourcing_theater_status",
        description: "Inspect the two-party SponsorAgent and CommunityAgent theater state.",
        parameters: EMPTY,
      },
      {
        name: "adsourcing_theater_reset",
        description: "Initialize the two-party theater with local contracts, two wallets, two agents, and optional local delivery.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: { allowLocalDelivery: { type: "boolean" } },
        },
      },
      {
        name: "adsourcing_sponsor_broadcast",
        description: "Sponsor Agent broadcasts a campaign intent to the local registry.",
        parameters: EMPTY,
      },
      {
        name: "adsourcing_community_handshake",
        description: "Community Agent verifies the sponsor handshake, score, wallet binding, and inventory.",
        parameters: EMPTY,
      },
      {
        name: "adsourcing_sponsor_offer",
        description: "Sponsor Agent makes a signed offer within mandate constraints.",
        parameters: EMPTY,
      },
      {
        name: "adsourcing_community_decide",
        description: "Community Agent evaluates the offer against price and content policy.",
        parameters: EMPTY,
      },
      {
        name: "adsourcing_sponsor_fund",
        description: "Sponsor Agent funds escrow after accepted terms.",
        parameters: EMPTY,
      },
      {
        name: "adsourcing_community_deliver",
        description: "Community Agent delivers the ad and logs delivery proof.",
        parameters: EMPTY,
      },
      {
        name: "adsourcing_sponsor_settle",
        description: "Sponsor Agent verifies delivery and settles escrow.",
        parameters: EMPTY,
      },
    ]) {
      api.registerTool({
        ...tool,
        async execute(_id, params) {
          const result = await callBridge(bridgeUrl, tool.name, params || {});
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        },
      });
    }

    api.registerCli(
      ({ program, config }) => {
        const cliBridgeUrl = resolveBridgeUrl(config);
        const command = program
          .command("adsourcing")
          .description("Run and inspect the AdSourcing autonomous sponsorship agents");

        command
          .command("status")
          .description("Inspect mandates, deal memory, proof bundles, and payment receipts")
          .action(async () => {
            const result = await callBridge(cliBridgeUrl, "adsourcing_status");
            console.log(JSON.stringify(result, null, 2));
          });

        command
          .command("run-local")
          .description("Run the local funded-chain SponsorAgent and CommunityAgent flow")
          .option("--discord", "Require real Discord bot delivery instead of local delivery")
          .action(async (options) => {
            const result = await callBridge(cliBridgeUrl, "adsourcing_run_agenthon_local", {
              allowLocalDelivery: !options.discord,
            });
            console.log(JSON.stringify(result, null, 2));
          });

        command
          .command("evidence")
          .description("Show recent proof bundles and payment receipts")
          .option("--limit <number>", "Maximum number of evidence records", (value) => Number(value), 5)
          .action(async (options) => {
            const result = await callBridge(cliBridgeUrl, "adsourcing_get_evidence", {
              limit: options.limit,
            });
            console.log(JSON.stringify(result, null, 2));
          });

        command
          .command("reset")
          .description("Initialize the two-party theater")
          .option("--discord", "Require real Discord bot delivery instead of local delivery")
          .action(async (options) => {
            const result = await callBridge(cliBridgeUrl, "adsourcing_theater_reset", {
              allowLocalDelivery: !options.discord,
            });
            console.log(JSON.stringify(result, null, 2));
          });

        command
          .command("sponsor-broadcast")
          .description("Sponsor Agent broadcasts the campaign intent")
          .action(async () => {
            const result = await callBridge(cliBridgeUrl, "adsourcing_sponsor_broadcast");
            console.log(JSON.stringify(result, null, 2));
          });

        command
          .command("community-handshake")
          .description("Community Agent verifies sponsor identity, score, and inventory")
          .action(async () => {
            const result = await callBridge(cliBridgeUrl, "adsourcing_community_handshake");
            console.log(JSON.stringify(result, null, 2));
          });

        command
          .command("sponsor-offer")
          .description("Sponsor Agent makes a signed offer")
          .action(async () => {
            const result = await callBridge(cliBridgeUrl, "adsourcing_sponsor_offer");
            console.log(JSON.stringify(result, null, 2));
          });

        command
          .command("community-decide")
          .description("Community Agent accepts or rejects the offer")
          .action(async () => {
            const result = await callBridge(cliBridgeUrl, "adsourcing_community_decide");
            console.log(JSON.stringify(result, null, 2));
          });

        command
          .command("sponsor-fund")
          .description("Sponsor Agent funds escrow")
          .action(async () => {
            const result = await callBridge(cliBridgeUrl, "adsourcing_sponsor_fund");
            console.log(JSON.stringify(result, null, 2));
          });

        command
          .command("community-deliver")
          .description("Community Agent delivers the ad and logs proof")
          .action(async () => {
            const result = await callBridge(cliBridgeUrl, "adsourcing_community_deliver");
            console.log(JSON.stringify(result, null, 2));
          });

        command
          .command("sponsor-settle")
          .description("Sponsor Agent verifies delivery and settles escrow")
          .action(async () => {
            const result = await callBridge(cliBridgeUrl, "adsourcing_sponsor_settle");
            console.log(JSON.stringify(result, null, 2));
          });

        command
          .command("theater")
          .description("Run the two-party SponsorAgent and CommunityAgent theater locally")
          .option("--discord", "Require real Discord bot delivery instead of local delivery")
          .action(async (options) => {
            const sequence = [
              ["adsourcing_theater_reset", { allowLocalDelivery: !options.discord }],
              ["adsourcing_sponsor_broadcast", {}],
              ["adsourcing_community_handshake", {}],
              ["adsourcing_sponsor_offer", {}],
              ["adsourcing_community_decide", {}],
              ["adsourcing_sponsor_fund", {}],
              ["adsourcing_community_deliver", {}],
              ["adsourcing_sponsor_settle", {}],
            ];
            let result;
            for (const [toolName, params] of sequence) {
              result = await callBridge(cliBridgeUrl, toolName, params);
              console.log(`\\n=== ${toolName} ===`);
              console.log(JSON.stringify(result, null, 2));
            }
          });
      },
      {
        descriptors: [
          {
            name: "adsourcing",
            description: "Run and inspect the AdSourcing autonomous sponsorship agents",
            hasSubcommands: true,
          },
        ],
      },
    );
  },
});
