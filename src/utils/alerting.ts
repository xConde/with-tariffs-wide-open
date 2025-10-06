import { discordClient } from '../core/discordClient';
import { EmbedBuilder } from 'discord.js';

const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

/**
 * Sends a critical failure alert to admin via DM
 */
export async function sendAdminAlert(message: string, details?: string): Promise<boolean> {
  if (!ADMIN_USER_ID) {
    console.warn('ADMIN_USER_ID not configured - skipping admin alert');
    return false;
  }

  try {
    const user = await discordClient.users.fetch(ADMIN_USER_ID);
    if (!user) {
      console.error('Admin user not found');
      return false;
    }

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c) // Red for errors
      .setTitle('⚠️ Bot Alert')
      .setDescription(message)
      .setTimestamp();

    if (details) {
      embed.addFields({ name: 'Details', value: details });
    }

    await user.send({ embeds: [embed] });
    console.log('Admin alert sent successfully');
    return true;
  } catch (error) {
    console.error('Failed to send admin alert:', error);
    return false;
  }
}

/**
 * Sends scraper failure alert after all retries exhausted
 */
export async function sendScraperFailureAlert(
  attempts: number,
  lastError: Error
): Promise<void> {
  const message = `Scraper failed after ${attempts} attempts`;
  const details = `Last error: ${lastError.message}\n\nBot is serving stale data. Please investigate.`;

  await sendAdminAlert(message, details);
}

/**
 * Sends general health alert
 */
export async function sendHealthAlert(
  component: string,
  issue: string
): Promise<void> {
  const message = `Health check failed: ${component}`;
  await sendAdminAlert(message, issue);
}
