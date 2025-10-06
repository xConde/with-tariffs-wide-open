import { formatInTimeZone } from 'date-fns-tz';
import { SOURCE_TIMEZONE, DISPLAY_TIMEZONE, TIMEZONE_ABBREV } from '../config/constants';

/**
 * Formats a time string with both source and display timezones
 * @param timeET - Time in ET format (e.g., "8:30 am")
 * @param dateET - Date object representing the event time in ET
 * @returns Formatted string like "8:30 am ET (7:30 am CT)"
 */
export function formatTimeWithTimezone(timeET: string, dateET: Date): string {
  if (SOURCE_TIMEZONE === DISPLAY_TIMEZONE) {
    const abbrev = TIMEZONE_ABBREV[SOURCE_TIMEZONE] || 'ET';
    return `${timeET} ${abbrev}`;
  }

  const displayTime = formatInTimeZone(dateET, DISPLAY_TIMEZONE, 'h:mm a');
  const sourceAbbrev = TIMEZONE_ABBREV[SOURCE_TIMEZONE] || 'ET';
  const displayAbbrev = TIMEZONE_ABBREV[DISPLAY_TIMEZONE] || '';

  return `${timeET} ${sourceAbbrev} (${displayTime} ${displayAbbrev})`;
}

/**
 * Gets timezone abbreviation for display
 */
export function getTimezoneAbbrev(timezone: string): string {
  return TIMEZONE_ABBREV[timezone] || timezone;
}

/**
 * Converts ET time string to display timezone
 * @param timeET - Time in ET format (e.g., "8:30 am")
 * @param eventDate - Full Date object for the event in ET
 * @returns Time in display timezone (e.g., "7:30 am")
 */
export function convertETToDisplayTime(timeET: string, eventDate: Date): string {
  if (SOURCE_TIMEZONE === DISPLAY_TIMEZONE) {
    return timeET;
  }
  return formatInTimeZone(eventDate, DISPLAY_TIMEZONE, 'h:mm a');
}
