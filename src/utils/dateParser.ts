import { parse, isValid } from 'date-fns';

/**
 * MarketWatch uses inconsistent month formats: "JAN.", "FEB.", "MAY", "JUNE", "SEPT." etc.
 * Normalize to full month names so date-fns parse() with 'MMMM' works reliably.
 */
export const MONTH_NORMALIZATION: Record<string, string> = {
  'JAN.': 'January', 'FEB.': 'February', 'MAR.': 'March', 'APR.': 'April',
  'MAY': 'May', 'JUNE': 'June', 'JULY': 'July', 'AUG.': 'August',
  'SEPT.': 'September', 'OCT.': 'October', 'NOV.': 'November', 'DEC.': 'December',
};

export function normalizeMarketWatchMonth(dayMonth: string): string {
  for (const [abbrev, full] of Object.entries(MONTH_NORMALIZATION)) {
    if (dayMonth.toUpperCase().startsWith(abbrev)) {
      return dayMonth.toUpperCase().replace(abbrev, full);
    }
  }
  return dayMonth;
}

export function fixTimeString(time: string): string {
  return /^\d{1,2}:\d{2}(am|pm)$/i.test(time)
    ? time.replace(/(am|pm)$/i, ' $1')
    : time;
}

/**
 * Resolves the correct calendar year for a normalized day-month string (e.g. "January 6").
 * Handles year rollover: MarketWatch shows ~2 months ahead, so Nov/Dec viewing Jan/Feb
 * events means those are next year. October is excluded — September events visible in
 * October are last-week stragglers, not year-boundary cases.
 */
export function resolveEventYear(dayMonth: string): number {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  const parsedDate = parse(`${dayMonth} ${currentYear}`, 'MMMM d yyyy', new Date());
  if (!isValid(parsedDate)) {
    return currentYear;
  }

  if (parsedDate.getMonth() < currentMonth && currentMonth >= 10) {
    return currentYear + 1;
  }

  return currentYear;
}

/**
 * Parses a MarketWatch date header string (e.g. "Monday, OCT. 6") into a Date.
 * Normalizes the month before parsing with date-fns.
 * Handles year rollover for Nov/Dec viewing dates in January.
 * Returns new Date(0) on failure.
 */
export function parseDateHeader(header: string): Date {
  try {
    const parts = header.split(',');
    const rawDayMonth = parts[1]?.trim() || '';
    const dayMonth = normalizeMarketWatchMonth(rawDayMonth);

    const year = resolveEventYear(dayMonth);
    const dateStr = `${dayMonth} ${year}`;
    const parsedDate = parse(dateStr, 'MMMM d yyyy', new Date());

    if (!isValid(parsedDate)) {
      return new Date(0);
    }

    return parsedDate;
  } catch {
    return new Date(0);
  }
}
