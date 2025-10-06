import { Client, GatewayIntentBits } from 'discord.js';

/**
 * Discord client instance - single source of truth
 * Extracted to prevent circular dependencies between discordBot and utilities
 */
export const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});
