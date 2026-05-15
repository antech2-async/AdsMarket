# AdSourcing OpenClaw Agenthon Runbook

AdSourcing is not a marketplace UI. It is a pair of accountable commercial agents:

- `SponsorAgent` receives a spend mandate, evaluates counterparties, negotiates, and funds escrow.
- `CommunityAgent` receives an inventory mandate, checks content and price policy, delivers the post, and signs delivery proof.

The contracts and dashboard are evidence rails. The agents are the product.

## Judge-Facing Claim

AdSourcing turns a commercial mandate into a negotiated, escrowed, verified outcome.

For the short pitch and Q&A spine, use `PITCH.md`.

The demo should show one clean loop:

1. Mandate is persisted.
2. Sponsor and community agents perform a signed handshake.
3. Agents negotiate inside deterministic policy rails.
4. Sponsor funds escrow.
5. Community delivers the ad.
6. Sponsor verifies delivery and settlement releases payment.
7. A proof bundle and payment receipt are generated.
8. A malicious ad is rejected before escrow.

## OpenClaw Integration

Run the bridge:

```bash
npm run openclaw:bridge
```

Install and configure OpenClaw:

```bash
npm install -g openclaw@latest
openclaw config set gateway.mode local
openclaw plugins install --link ./openclaw-plugin
openclaw config patch --stdin < openclaw-config.patch.json5
openclaw gateway run --bind loopback
```

If you do not use a patch file, the minimum config shape is:

```json5
{
  plugins: {
    load: { paths: ["D:\\AAL\\Coding\\Admarket\\openclaw-plugin"] },
    entries: {
      adsourcing: {
        enabled: true,
        config: { bridgeUrl: "http://127.0.0.1:4020/openclaw" },
      },
    },
  },
  tools: {
    profile: "minimal",
    allow: [
      "adsourcing_status",
      "adsourcing_run_agenthon_local",
      "adsourcing_get_evidence",
    ],
  },
}
```

Verify OpenClaw sees the plugin:

```bash
openclaw plugins inspect adsourcing --runtime --json
openclaw adsourcing --help
```

The plugin exposes these agent tools:

- `adsourcing_status`
- `adsourcing_run_happy_path`
- `adsourcing_run_bad_case`
- `adsourcing_run_agenthon_local`
- `adsourcing_theater_status`
- `adsourcing_theater_reset`
- `adsourcing_sponsor_broadcast`
- `adsourcing_community_handshake`
- `adsourcing_sponsor_offer`
- `adsourcing_community_decide`
- `adsourcing_sponsor_fund`
- `adsourcing_community_deliver`
- `adsourcing_sponsor_settle`
- `adsourcing_save_sponsor_mandate`
- `adsourcing_save_community_mandate`
- `adsourcing_get_evidence`

The plugin calls the bridge at `http://localhost:4020/openclaw` by default. Override with:

```bash
ADSOURCING_BRIDGE_URL=http://localhost:4020/openclaw
```

## Fast Showcase

```bash
npm run showcase
```

This runs the successful payment loop and the bad-case rejection loop, then prints the proof and payment artifacts to show during judging.

## Agenthon Local Mode

This is the recommended middle-ground demo when you do not want faucet/testnet friction.

```bash
npm run agenthon:local
```

It starts a local Hardhat chain if needed, deploys local ERC-8004-style identity/reputation contracts, deploys `MockUSDC`, `IntentRegistry`, and `AdEscrow`, mints test USDC to the sponsor wallet, registers both agents, negotiates, funds escrow, logs delivery, settles payment, and writes proof/payment receipts.

For real Discord bot delivery, set:

```bash
COMMUNITY_DISCORD_BOT_TOKEN=...
SPONSOR_DISCORD_BOT_TOKEN=...
COMMUNITY_DISCORD_BOT_USER_ID=...
DEMO_DISCORD_GUILD_ID=...
DEMO_DISCORD_CHANNEL_ID=...
```

`COMMUNITY_DISCORD_BOT_TOKEN` is the delivery actor. It posts the sponsored embed into the community channel.
`SPONSOR_DISCORD_BOT_TOKEN` is the verification actor. It reads the delivered message back from Discord before
settlement. For a quick private smoke test, both variables may point to the same bot token. For the stronger
two-party demo, create two Discord apps/bots so sponsor verification and community delivery are visibly separate.

Discord setup checklist:

1. Create a Community app in the Discord Developer Portal, open **Bot**, reset/copy its bot token.
2. Create a Sponsor verifier app the same way and copy its bot token.
3. Install both bots into the same test server. The Community bot needs `View Channel`, `Send Messages`,
   `Embed Links`, and `Read Message History`. The Sponsor verifier needs `View Channel` and `Read Message History`.
4. Copy the Community bot user ID from the Developer Portal application ID or by right-clicking the bot user after
   enabling Developer Mode.
5. In Discord, enable Developer Mode, then right-click the server and target channel to copy their IDs.
6. Set `AGENTHON_ALLOW_LOCAL_DELIVERY=false` when you want the run to fail unless Discord is real.
7. Validate without exposing secrets:

```bash
npm run discord:preflight
```

If the tokens and channel are valid, the script can write derived non-secret IDs such as
`COMMUNITY_DISCORD_BOT_USER_ID` and `DEMO_DISCORD_GUILD_ID`:

```bash
npm run discord:preflight -- --write
```

If you only want to prove the agent/payment path before the bots are configured, set:

```bash
AGENTHON_ALLOW_LOCAL_DELIVERY=true
```

From OpenClaw, call:

```text
adsourcing_run_agenthon_local
```

Use `allowLocalDelivery: true` only when Discord is not configured.

For a deterministic OpenClaw-owned CLI run before model auth is configured:

```bash
openclaw adsourcing status
openclaw adsourcing run-local
openclaw adsourcing evidence --limit 2
```

For a true OpenClaw LLM agent turn, configure model auth first:

```bash
npm run llm:probe
openclaw models auth add
openclaw agent --local --model google/gemini-3-flash-preview --session-id adsourcing-demo --message "Use adsourcing_run_agenthon_local with allowLocalDelivery true, then summarize the sponsor/community interaction, escrow txs, delivery proof, settlement receipt, and any failed policy checks." --json
```

For the OpenClaw + Discord recording path:

```bash
openclaw agent --local --model google/gemini-3-flash-preview --session-id adsourcing-discord-demo --message "Use adsourcing_run_agenthon_local with allowLocalDelivery false, then summarize the sponsor/community interaction, escrow txs, Discord delivery proof, settlement receipt, and any failed policy checks." --json
```

## Two-Agent Theater Mode

For the judge-facing version that makes the two user POVs obvious, use the dashboard button:

```text
Run Two-Agent POV
```

This executes the role-specific bridge tools in order:

1. `adsourcing_theater_reset`
2. `adsourcing_sponsor_broadcast`
3. `adsourcing_community_handshake`
4. `adsourcing_sponsor_offer`
5. `adsourcing_community_decide`
6. `adsourcing_sponsor_fund`
7. `adsourcing_community_deliver`
8. `adsourcing_sponsor_settle`

The point is not more complexity for its own sake. It makes the demo legible: Sponsor and Community act as separate
principals while the registry, escrow, proof, and receipt rails remain real.

Keep OpenClaw's tool profile minimal for small or quota-constrained models. With the full default tool surface,
Gemini/Gemma models may spend the turn reading unrelated tools instead of calling the AdSourcing tool.

## Two-Party Topology

The stage-friendly run has one OpenClaw supervisor call the AdSourcing tool so the whole transaction is recordable in
one shot. The commercial model is still two-party:

- Sponsor user owns the Sponsor Agent mandate, sponsor wallet, and escrow funds.
- Community user owns the Community Agent mandate, Discord bot/channel, content policy, and payout wallet.

For production, these can run as two separate services or two separate OpenClaw sessions. The shared protocol between
them is the registry intent, signed handshake, signed offer/acceptance, escrow contract, delivery proof, and reputation
feedback. The dashboard deliberately compresses both sides into one control room for judging clarity.

## Live Mode, No Mock Claims

Demo mode is deterministic. Live mode is strict and refuses to run if the external pieces are not real.

1. Deploy `IntentRegistry` and `AdEscrow` to Base Sepolia:

```bash
npm run deploy:base
```

2. Put the deployed addresses in `.env`.
3. Generate and host the agent cards, then register the agents:

```bash
npm run cards
npm run register
```

4. Fund the Sponsor wallet with Base Sepolia ETH and testnet USDC.
5. Fund the Community wallet with Base Sepolia ETH for delivery logging.
6. Set Discord bot tokens, guild ID, and channel ID.
7. Disable mock reputation:

```bash
USE_MOCK_REPUTATION=false
```

8. Run the hard preflight:

```bash
npm run live:preflight
```

9. Run the real path:

```bash
npm run live
```

Live mode uses the configured Base Sepolia contracts, real wallet signatures, actual USDC approval/escrow/settlement calls, real Discord delivery, and proof/payment receipts generated from that run. If any dependency is missing, it fails instead of pretending.

## Evidence Artifacts

- Proof bundles: `cache/proofs/*.proof.json`
- Payment receipts: `cache/payment-receipts/*.payment.json`
- Bad-case result: `cache/badcase-result.json`
- Agent mandates: `cache/sponsor_mandate.json`, `cache/community_mandate.json`
- Agent memory: `cache/sponsor_memory.json`, `cache/community_memory.json`
