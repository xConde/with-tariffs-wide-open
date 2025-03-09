import { parse, addMinutes, differenceInMilliseconds, isValid } from 'date-fns';
import { getTimezoneOffset } from 'date-fns-tz';
import { getStoredEvents } from './storage';
import { buildNotificationEmbed, sendNotificationEmbed } from './notifierMessage';
import { CalendarEvent } from './models/event';

const EST_TIMEZONE = 'America/New_York';

declare global {
  var notificationTimeouts: Map<string, NodeJS.Timeout[]>;
}
globalThis.notificationTimeouts = globalThis.notificationTimeouts || new Map();

function fixTimeString(time: string): string {
  if (/^\d{1,2}:\d{2}(am|pm)$/i.test(time)) {
    return time.replace(/(am|pm)$/i, ' $1');
  }
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

function groupEventsByNotificationTime(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const groups = new Map<string, CalendarEvent[]>();
  for (const evt of events) {
    const eventTime = parseEventDateTime(evt);
    if (!eventTime) continue;
    if (eventTime.getTime() <= Date.now()) continue;
    eventTime.setSeconds(0, 0);
    const key = eventTime.toISOString();
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)?.push(evt);
  }
  return groups;
}

function clearScheduledNotifications(): void {
  globalThis.notificationTimeouts.forEach((timeouts) => {
    timeouts.forEach((timeoutId) => clearTimeout(timeoutId));
  });
  globalThis.notificationTimeouts.clear();
}

export async function scheduleNotifications(): Promise<void> {
  clearScheduledNotifications();

  const events = await getStoredEvents();
  if (events.length === 0) return;

  const groups = groupEventsByNotificationTime(events);

  groups.forEach((groupEvents, groupTimeStr) => {
    const eventTime = new Date(groupTimeStr);
    const notifTime30 = addMinutes(eventTime, -30);
    const notifTime1 = addMinutes(eventTime, -1);
    const notifTimes = [notifTime30, notifTime1];
    const timeoutIds: NodeJS.Timeout[] = [];

    notifTimes.forEach((notifTime) => {
      const delay = differenceInMilliseconds(notifTime, new Date());
      if (delay > 0) {
        const windowMinutes = notifTime === notifTime30 ? 30 : 1;
        const timeoutId = setTimeout(() => {
          const embed = buildNotificationEmbed(windowMinutes, groupEvents);
          sendNotificationEmbed(embed);
        }, delay);

        timeoutIds.push(timeoutId);
        console.log(
          `Scheduled notification for ${notifTime.toLocaleString('en-US', { timeZone: EST_TIMEZONE })} in ${(delay / 1000).toFixed(1)}s`
        );
      }
    });

    globalThis.notificationTimeouts.set(groupTimeStr, timeoutIds);
  });
}

export async function refreshNotifications(): Promise<void> {
  await scheduleNotifications();
}

scheduleNotifications().catch((err) => {
  console.error('Error scheduling notifications:', err);
});
