import './globalSetup';
import { initializeDiscordBot } from './discordBot';
import './scheduler';

async function startApp() {
  try {
    await initializeDiscordBot();
    console.log(`Current date: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`);
    console.log('Application started.');
  } catch (error) {
    console.error('Failed to initialize application:', error);
  }
}

startApp();
