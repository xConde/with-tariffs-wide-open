import { REST, Routes } from 'discord.js';
import 'dotenv/config';
import { calendarCommand } from './commands/calendar';
import { createLogger } from './utils/logger';

const log = createLogger('deploy');

(async () => {
  try {
    const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
    const CLIENT_ID = process.env.CLIENT_ID;
    const GUILD_ID = process.env.GUILD_ID;

    if (!DISCORD_TOKEN || !CLIENT_ID) {
      log.warn('DISCORD_TOKEN or CLIENT_ID missing — skipping command deployment, bot will use last registered commands.');
      return;
    }

    const commands = [calendarCommand.data.toJSON()];
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      log.info('Reloaded guild application (/) commands.');
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      log.info('Reloaded global application (/) commands.');
    }
  } catch (error) {
    log.warn('Command deployment failed — bot will start with last registered commands.', { error: String(error) });
  }
})();
