import { discordClient } from '../discordBot';
import { ChannelType, PermissionFlagsBits, TextChannel } from 'discord.js';

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
  console.log('Validating Discord channels...');

  const primary = await validateChannel(primaryChannelId);

  if (!primary.accessible) {
    console.error(`❌ Primary channel (${primaryChannelId}) not accessible:`, primary.errors);
    throw new Error('Primary notification channel not accessible');
  }

  if (!primary.hasPermissions) {
    console.error(`❌ Primary channel missing permissions:`, primary.errors);
    throw new Error('Bot lacks permissions in primary channel');
  }

  console.log(`✅ Primary channel validated`);

  if (fallbackChannelId) {
    const fallback = await validateChannel(fallbackChannelId);

    if (!fallback.accessible) {
      console.warn(`⚠️  Fallback channel (${fallbackChannelId}) not accessible:`, fallback.errors);
    } else if (!fallback.hasPermissions) {
      console.warn(`⚠️  Fallback channel missing permissions:`, fallback.errors);
    } else {
      console.log(`✅ Fallback channel validated`);
    }
  }
}
