import { Client, GatewayIntentBits } from 'discord.js';

/**
 * Discord client instance - single source of truth
 * Extracted to prevent circular dependencies between discordBot and utilities
 */
// Only Guilds intent is needed — the bot uses slash commands (interactionCreate)
// and buttons, which don't require GuildMessages.
export const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds],
});
