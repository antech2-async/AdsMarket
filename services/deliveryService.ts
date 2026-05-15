import { Client, GatewayIntentBits, TextChannel, EmbedBuilder, Events } from 'discord.js';
import axios from 'axios';
import { ReplizService } from './replizService';

export class DeliveryService {
  private discordClient: Client;
  private discordReady = false;
  private repliz = new ReplizService();

  constructor() {
    this.discordClient = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    });
  }

  async initDiscord(): Promise<void> {
    if (!process.env.COMMUNITY_DISCORD_BOT_TOKEN) {
      console.warn('[DeliveryService] Discord token missing. Discord delivery disabled.');
      return;
    }
    await this.discordClient.login(process.env.COMMUNITY_DISCORD_BOT_TOKEN);
    if (this.discordClient.isReady()) {
      this.discordReady = true;
      return;
    }
    await new Promise<void>(resolve => this.discordClient.once(Events.ClientReady, () => {
      console.log(`[DeliveryService] Discord bot ready: ${this.discordClient.user?.tag}`);
      this.discordReady = true;
      resolve();
    }));
  }

  async postToDiscord(channelId: string, adCopy: string): Promise<string> {
    if (!this.discordReady) await this.initDiscord();

    console.log(`[DeliveryService] Fetching channel ${channelId}...`);
    const channel = await this.discordClient.channels.fetch(channelId) as TextChannel;
    if (!channel?.isTextBased()) throw new Error(`Channel ${channelId} not found or not text`);

    console.log(`[DeliveryService] Sending embed to channel ${channel.name}...`);
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📢 Sponsored')
      .setDescription(adCopy)
      .setFooter({ text: 'Sponsored via AdMarket Protocol • On-chain verified' })
      .setTimestamp();

    const sendPromise = channel.send({ embeds: [embed] });
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Discord send timeout after 30s')), 30000));
    const message = await Promise.race([sendPromise, timeoutPromise]) as any;
    console.log(`[DeliveryService] Discord message sent. ID: ${message.id}`);
    
    await this.repliz.recordDiscordDelivery(message.id);
    
    return message.id;
  }

  async close(): Promise<void> {
    if (this.discordReady) {
      this.discordClient.destroy();
      this.discordReady = false;
    }
  }

  async postToTelegram(chatId: string, adCopy: string): Promise<string> {
    const botToken = process.env.COMMUNITY_TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new Error('Telegram bot token missing');

    const response = await axios.post(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        chat_id: chatId,
        text: `📢 *Sponsored*\n\n${adCopy}\n\n_Delivered via AdMarket Protocol_`,
        parse_mode: 'Markdown',
      }
    );

    if (!response.data.ok) throw new Error(`Telegram API error: ${response.data.description}`);

    console.log(`[DeliveryService] Telegram message sent. ID: ${response.data.result.message_id}`);
    return String(response.data.result.message_id);
  }
}
