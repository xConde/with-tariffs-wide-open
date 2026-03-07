import { REST, Routes } from 'discord.js';
import 'dotenv/config';
import { calendarCommand } from './commands/calendar';
import { createLogger } from './utils/logger';

const log = createLogger('deploy');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN as string;
const CLIENT_ID = process.env.CLIENT_ID as string;
const GUILD_ID = process.env.GUILD_ID;

const commands = [calendarCommand.data.toJSON()];
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      log.info('Reloaded guild application (/) commands.');
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      log.info('Reloaded global application (/) commands.');
    }
  } catch (error) {
    log.error('Failed to deploy commands', { error: String(error) });
  }
})();
