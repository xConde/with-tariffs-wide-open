import './globalSetup';
import { parse, addMinutes, differenceInMilliseconds, isValid } from 'date-fns';
import { getTimezoneOffset } from 'date-fns-tz';
import { Message } from 'discord.js';
import { getStoredEvents, saveEvents } from './storage';
import { CalendarEvent } from './models/event';
import { scrapeEconomicCalendar } from './scraper';
import { buildNotificationEmbed, buildUpdatedNotificationEmbed } from './events/notifierMessage';
import { sendEmbed } from './discordBot';

const EST_TIMEZONE = 'America/New_York';

declare global {
  var notificationTimeouts: Map<string, NodeJS.Timeout[]>;
}
globalThis.notificationTimeouts = globalThis.notificationTimeouts || new Map();

function fixTimeString(time: string): string {
  return /^\d{1,2}:\d{2}(am|pm)$/i.test(time)
    ? time.replace(/(am|pm)$/i, ' $1')
    : time;
}

function getEasternOffsetString(date: Date): string {
  const offsetMs = getTimezoneOffset(EST_TIMEZONE, date);
  const offsetHours = offsetMs / (60 * 60 * 1000);
  const sign = offsetHours >= 0 ? '+' : '-';
  const absHours = Math.abs(offsetHours);
  return `${sign}${absHours.toString().padStart(2, '0')}00`;
}

function parseEventDateTime(event: CalendarEvent): Date | null {
  const parts = event.date.split(',');
  const dayMonth = parts[1]?.trim() || '';
  const year = new Date().getFullYear();
  const fixedTime = fixTimeString(event.time);
  const baseStr = `${dayMonth} ${year} ${fixedTime}`;
  const baseDate = parse(baseStr, 'MMMM d yyyy h:mm a', new Date());
  if (!isValid(baseDate)) return null;
  const offsetStr = getEasternOffsetString(baseDate);
  const fullStr = `${dayMonth} ${year} ${fixedTime} ${offsetStr}`;
  const parsedDate = parse(fullStr, 'MMMM d yyyy h:mm a X', new Date());
  return isValid(parsedDate) ? parsedDate : null;
}

function getGroupingKey(event: CalendarEvent): string | null {
  const date = parseEventDateTime(event);
  if (!date) return null;
  date.setSeconds(0, 0);
  return date.toISOString();
}

function groupEvents(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const groups = new Map<string, CalendarEvent[]>();
  for (const evt of events) {
    const key = getGroupingKey(evt);
    if (!key) continue;
    const evtTime = parseEventDateTime(evt)!;
    if (evtTime.getTime() <= Date.now()) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(evt);
  }
  return groups;
}

function clearScheduledNotifications(): void {
  globalThis.notificationTimeouts.forEach(timeouts => {
    timeouts.forEach(id => clearTimeout(id));
  });
  globalThis.notificationTimeouts.clear();
}

export async function scheduleNotifications(): Promise<void> {
  clearScheduledNotifications();
  const events = await getStoredEvents();
  if (events.length === 0) return;
  const groups = groupEvents(events);

  const sortedGroupEntries = Array.from(groups.entries()).sort((a, b) => {
    const dateA = new Date(a[0]);
    const dateB = new Date(b[0]);
    return dateA.getTime() - dateB.getTime();
  });

  for (const [groupKey, groupEvents] of sortedGroupEntries) {
    const eventTime = parseEventDateTime(groupEvents[0]);
    if (!eventTime) continue;
    const notifTime30 = addMinutes(eventTime, -30);
    const notifTime1 = addMinutes(eventTime, -1);
    const notifTimes = [notifTime30, notifTime1];
    const timeoutIds: NodeJS.Timeout[] = [];

    notifTimes.forEach(nt => {
      const delay = differenceInMilliseconds(nt, new Date());
      if (delay > 0) {
        const windowMinutes = (nt.getTime() === notifTime30.getTime()) ? 30 : 1;
        const timeoutId = setTimeout(async () => {
          if (windowMinutes === 1) {
            const embed = buildNotificationEmbed(windowMinutes, groupEvents);
            const msg = await sendEmbed(embed);
            setTimeout(async () => {
              await updateCalendarAlert(msg, groupEvents);
            }, 90000);
          } else {
            const embed = buildNotificationEmbed(windowMinutes, groupEvents);
            await sendEmbed(embed);
          }
        }, delay);
        timeoutIds.push(timeoutId);
        console.log(
          `Scheduled notification for ${nt.toLocaleString('en-US', { timeZone: EST_TIMEZONE })} in ${(delay / 1000).toFixed(1)}s`
        );
      }
    });
    globalThis.notificationTimeouts.set(groupKey, timeoutIds);
  }
}

async function updateCalendarAlert(msg: Message<boolean> | null, originalGroup: CalendarEvent[]): Promise<void> {
  try {
    const scrapedEvents = await scrapeEconomicCalendar();
    const originalKey = getGroupingKey(originalGroup[0]);
    if (!originalKey) return;
    const updatedGroup = scrapedEvents.filter(evt => getGroupingKey(evt) === originalKey);
    console.log('Updated group events:', updatedGroup);

    const embedToUse = buildUpdatedNotificationEmbed(
      updatedGroup.length > 0 ? updatedGroup : originalGroup
    );
    if (msg && typeof msg.edit === 'function') {
      await msg.edit({ embeds: [embedToUse] });
    }

    if (scrapedEvents.length > 0 && updatedGroup.length > 0) {
      await saveEvents(scrapedEvents);
      console.log('Events updated and notifications refreshed.');
    } else {
      console.log('Scrape returned no updated events for group.');
    }
  } catch (error) {
    console.error('Error during scheduled update:', error);
  }
}

export async function refreshNotifications(): Promise<void> {
  await scheduleNotifications();
}

scheduleNotifications().catch(err => console.error('Error scheduling notifications:', err));
