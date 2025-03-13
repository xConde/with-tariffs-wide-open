import { parse, addMinutes, differenceInMilliseconds, isValid } from 'date-fns';
import { getTimezoneOffset } from 'date-fns-tz';
import { getStoredEvents, saveEvents } from './storage';
import { buildNotificationEmbed, sendNotificationEmbed, buildUpdatedNotificationEmbed } from './notifierMessage';
import { CalendarEvent } from './models/event';
import { scrapeEconomicCalendar } from './scraper';
import { Message } from 'discord.js';

const EST_TIMEZONE = 'America/New_York';

declare global {
  var notificationTimeouts: Map<string, NodeJS.Timeout[]>;
}
globalThis.notificationTimeouts = globalThis.notificationTimeouts || new Map();

function fixTimeString(time: string): string {
  if (/^\d{1,2}:\d{2}(am|pm)$/i.test(time)) return time.replace(/(am|pm)$/i, ' $1');
  return time;
}

function getEasternOffsetStringForDate(date: Date): string {
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
  const offsetStr = getEasternOffsetStringForDate(baseDate);
  const fullStr = `${dayMonth} ${year} ${fixedTime} ${offsetStr}`;
  const parsedDate = parse(fullStr, 'MMMM d yyyy h:mm a X', new Date());
  if (!isValid(parsedDate)) return null;
  return parsedDate;
}

function groupEventsByTime(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const evt of events) {
    const eventTime = parseEventDateTime(evt);
    if (!eventTime) continue;
    if (eventTime.getTime() <= Date.now()) continue;
    eventTime.setSeconds(0, 0);
    const key = eventTime.toISOString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)?.push(evt);
  }
  return map;
}

function clearScheduledNotifications(): void {
  globalThis.notificationTimeouts.forEach((timeouts) => {
    timeouts.forEach((id) => clearTimeout(id));
  });
  globalThis.notificationTimeouts.clear();
}

export async function scheduleNotifications(): Promise<void> {
  clearScheduledNotifications();
  const events = await getStoredEvents();
  if (events.length === 0) return;
  const groups = groupEventsByTime(events);
  groups.forEach((groupEvents, isoTime) => {
    const eventTime = new Date(isoTime);
    const notifTime30 = addMinutes(eventTime, -30);
    const notifTime1 = addMinutes(eventTime, -1);
    const notifTimes = [notifTime30, notifTime1];
    const timeoutIds: NodeJS.Timeout[] = [];
    notifTimes.forEach((nt) => {
      const delay = differenceInMilliseconds(nt, new Date());
      if (delay > 0) {
        const windowMinutes = nt.getTime() === notifTime30.getTime() ? 30 : 1;
        const timeoutId = setTimeout(async () => {
          if (windowMinutes === 1) {
            const embed = buildNotificationEmbed(windowMinutes, groupEvents);
            const msg = await sendNotificationEmbed(embed);
            setTimeout(async () => {
              updateCalendarAlert(msg, groupEvents);
            }, 75000);
          } else {
            const embed = buildNotificationEmbed(windowMinutes, groupEvents);
            sendNotificationEmbed(embed);
          }
        }, delay);
        timeoutIds.push(timeoutId);
        console.log(
          `Scheduled notification for ${nt.toLocaleString('en-US', { timeZone: EST_TIMEZONE })} in ${(delay / 1000).toFixed(1)}s`
        );
      }
    });
    globalThis.notificationTimeouts.set(isoTime, timeoutIds);
  });
}

async function updateCalendarAlert(msg: Message<boolean> | null, groupEvents: CalendarEvent[]): Promise<void> {
  try {
    const scrapedEvents = await scrapeEconomicCalendar();
    const groupKey = parseEventDateTime(groupEvents[0])?.toISOString();
    const updatedGroupEvents = scrapedEvents.filter(evt => {
      const evtTime = parseEventDateTime(evt);
      if (!evtTime) return false;
      evtTime.setSeconds(0, 0);
      return evtTime.toISOString() === groupKey;
    });
    const updatedEmbed = buildUpdatedNotificationEmbed(updatedGroupEvents);
    if (msg && typeof msg.edit === "function") {
      await msg.edit({ embeds: [updatedEmbed] });
    }
    if (scrapedEvents.length > 0) {
      await saveEvents(scrapedEvents);
      await refreshNotifications();
      console.log('Events updated and notifications refreshed.');
    } else {
      console.log('Scrape returned no events.');
    }
  } catch (error) {
    console.error('Error during scheduled update:', error);
  }
}

export async function refreshNotifications(): Promise<void> {
  await scheduleNotifications();
}

scheduleNotifications().catch((err) => {
  console.error('Error scheduling notifications:', err);
});
