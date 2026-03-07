import { discordClient } from '../core/discordClient';
import { ChannelType, PermissionFlagsBits, TextChannel } from 'discord.js';
import { createLogger } from './logger';

const log = createLogger('channels');

interface ChannelCheckResult {
  accessible: boolean;
  hasPermissions: boolean;
  errors: string[];
}

/**
 * Validates that bot can access and send messages to a channel
 */
export async function validateChannel(channelId: string): Promise<ChannelCheckResult> {
  const errors: string[] = [];

  try {
    const channel = await discordClient.channels.fetch(channelId);

    if (!channel) {
      errors.push('Channel not found');
      return { accessible: false, hasPermissions: false, errors };
    }

    if (channel.type !== ChannelType.GuildText) {
      errors.push('Channel is not a text channel');
      return { accessible: false, hasPermissions: false, errors };
    }

    const textChannel = channel as TextChannel;

    const permissions = textChannel.permissionsFor(discordClient.user!);
    if (!permissions) {
      errors.push('Cannot determine permissions');
      return { accessible: true, hasPermissions: false, errors };
    }

    const requiredPermissions = [
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.ViewChannel,
    ];

    const missingPermissions = requiredPermissions.filter(perm => !permissions.has(perm));

    if (missingPermissions.length > 0) {
      errors.push(`Missing permissions: ${missingPermissions.join(', ')}`);
      return { accessible: true, hasPermissions: false, errors };
    }

    return { accessible: true, hasPermissions: true, errors: [] };
  } catch (error) {
    errors.push(`Error checking channel: ${error instanceof Error ? error.message : String(error)}`);
    return { accessible: false, hasPermissions: false, errors };
  }
}

/**
 * Validates primary and fallback channels on bot startup
 */
export async function validateChannelsOnStartup(
  primaryChannelId: string,
  fallbackChannelId?: string
): Promise<void> {
  log.info('Validating Discord channels...');

  const primary = await validateChannel(primaryChannelId);

  if (!primary.accessible) {
    log.error(`Primary channel (${primaryChannelId}) not accessible`, { errors: primary.errors.join(', ') });
    throw new Error('Primary notification channel not accessible');
  }

  if (!primary.hasPermissions) {
    log.error('Primary channel missing permissions', { errors: primary.errors.join(', ') });
    throw new Error('Bot lacks permissions in primary channel');
  }

  log.info('Primary channel validated');

  if (fallbackChannelId) {
    const fallback = await validateChannel(fallbackChannelId);

    if (!fallback.accessible) {
      log.warn(`Fallback channel (${fallbackChannelId}) not accessible`, { errors: fallback.errors.join(', ') });
    } else if (!fallback.hasPermissions) {
      log.warn('Fallback channel missing permissions', { errors: fallback.errors.join(', ') });
    } else {
      log.info('Fallback channel validated');
    }
  }
}
