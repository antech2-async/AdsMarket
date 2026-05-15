import { Client, GatewayIntentBits, TextChannel, EmbedBuilder } from 'discord.js';
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
    await new Promise<void>(resolve => this.discordClient.once('ready', () => {
      console.log(`[DeliveryService] Discord bot ready: ${this.discordClient.user?.tag}`);
      this.discordReady = true;
      resolve();
    }));
  }

  async postToDiscord(channelId: string, adCopy: string): Promise<string> {
    if (!this.discordReady) await this.initDiscord();

    const channel = await this.discordClient.channels.fetch(channelId) as TextChannel;
    if (!channel?.isTextBased()) throw new Error(`Channel ${channelId} not found or not text`);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📢 Sponsored')
      .setDescription(adCopy)
      .setFooter({ text: 'Sponsored via AdMarket Protocol • On-chain verified' })
      .setTimestamp();

    const message = await channel.send({ embeds: [embed] });
    console.log(`[DeliveryService] Discord message sent. ID: ${message.id}`);
    
    // Auto-monitor via Repliz
    await this.repliz.monitorPostEngagement('discord', message.id);
    
    return message.id;
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
