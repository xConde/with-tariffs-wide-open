import { initializeDiscordBot } from './discordBot';
import './scheduler';

async function startApp() {
  try {
    await initializeDiscordBot();
    console.log('Application started.');
  } catch (error) {
    console.error('Failed to initialize application:', error);
  }
}

startApp();
