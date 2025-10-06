import { CalendarEvent } from '../models/event';
import { addDays, addHours, format, startOfDay } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

interface EventTemplate {
  title: string;
  period: string;
  forecast?: string;
  previous?: string;
  hasActual?: boolean;
}

const economicIndicators: EventTemplate[] = [
  { title: 'U.S. trade deficit', period: 'Aug.', forecast: '$-60.7B', previous: '-$78.3B' },
  { title: 'Consumer credit', period: 'Aug.', forecast: '$14.0B', previous: '$16.0B' },
  { title: 'Consumer price index', period: 'Sept.', forecast: '0.4%', previous: '0.3%' },
  { title: 'CPI year over year', period: 'Sept.', forecast: '2.9%', previous: '3.1%' },
  { title: 'Core CPI', period: 'Sept.', forecast: '0.3%', previous: '0.2%' },
  { title: 'U.S. retail sales', period: 'Sept.', forecast: '0.6%', previous: '0.5%' },
  { title: 'Producer price index', period: 'Sept.', forecast: '-0.1%', previous: '0.1%' },
  { title: 'Initial jobless claims', period: 'Oct. 11', forecast: '220,000', previous: '218,000' },
  { title: 'Housing starts', period: 'Sept.', forecast: '1.31 million', previous: '1.28 million' },
  { title: 'Building permits', period: 'Sept.', forecast: '1.31 million', previous: '1.29 million' },
  { title: 'Consumer sentiment (prelim)', period: 'Oct.', forecast: '53.5', previous: '60.4' },
  { title: 'Monthly U.S. federal budget', period: 'Sept.', forecast: '--', previous: '-$170.7B' },
  { title: 'Wholesale inventories', period: 'Aug.', forecast: '--', previous: '0.1%' },
  { title: 'Industrial production', period: 'Sept.', forecast: '0.1%', previous: '-0.1%' },
  { title: 'Capacity utilization', period: 'Sept.', forecast: '77.4%', previous: '77.2%' },
];

const fedSpeeches: EventTemplate[] = [
  { title: 'Federal Reserve Chair Jerome Powell opening remarks', period: '' },
  { title: 'Atlanta Fed President Raphael Bostic speaks', period: '' },
  { title: 'Minneapolis Fed President Neel Kashkari speaks', period: '' },
  { title: 'Chicago Fed President Austan Goolsbee speaks', period: '' },
  { title: 'San Francisco Fed President Daly speaks', period: '' },
  { title: 'Federal Reserve governor Stephen Miran speaks', period: '' },
  { title: 'New York Fed President John Williams speech', period: '' },
  { title: 'Dallas Fed President Lorie Logan speech', period: '' },
];

const eventTimes = [
  '6:00 am', '7:30 am', '8:15 am', '8:30 am', '8:45 am',
  '9:00 am', '9:15 am', '9:30 am', '9:45 am', '10:00 am',
  '10:30 am', '11:00 am', '12:00 pm', '12:45 pm', '1:30 pm',
  '2:00 pm', '3:00 pm', '3:30 pm', '4:00 pm', '5:00 pm',
  '6:00 pm', '7:15 pm', '9:40 pm'
];

/**
 * Generates realistic economic calendar test data relative to current date/time
 * @param daysAhead - Number of days ahead to generate events for
 * @param timezone - Timezone for the events (default: America/New_York)
 * @returns Array of CalendarEvent objects
 */
export function generateTestEvents(
  daysAhead: number = 14,
  timezone: string = 'America/New_York'
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const today = startOfDay(new Date());
  const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const monthAbbrev = ['JAN.', 'FEB.', 'MAR.', 'APR.', 'MAY', 'JUNE', 'JULY', 'AUG.', 'SEPT.', 'OCT.', 'NOV.', 'DEC.'];

  for (let day = 0; day < daysAhead; day++) {
    const currentDate = addDays(today, day);
    const dayName = dayNames[currentDate.getDay()];
    const monthName = monthAbbrev[currentDate.getMonth()];
    const dayNum = currentDate.getDate();
    const dateHeader = `${dayName}, ${monthName} ${dayNum}`;

    const numEvents = Math.floor(Math.random() * 5) + 2; // 2-6 events per day

    for (let i = 0; i < numEvents; i++) {
      const isSpeech = Math.random() > 0.6;
      const template = isSpeech
        ? fedSpeeches[Math.floor(Math.random() * fedSpeeches.length)]
        : economicIndicators[Math.floor(Math.random() * economicIndicators.length)];

      const time = eventTimes[Math.floor(Math.random() * eventTimes.length)];

      const event: CalendarEvent = {
        date: dateHeader,
        time,
        title: template.title,
        period: template.period,
        forecast: template.forecast || '',
        previous: template.previous || '',
        actual: '', // Empty for future events
      };

      events.push(event);
    }
  }

  // Sort events by date and time
  return events.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.time.localeCompare(b.time);
  });
}

/**
 * Generates past events with actual values populated (for testing notifications)
 */
export function generatePastEventsWithActuals(hoursAgo: number = 2): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const eventDate = addHours(new Date(), -hoursAgo);
  const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const monthAbbrev = ['JAN.', 'FEB.', 'MAR.', 'APR.', 'MAY', 'JUNE', 'JULY', 'AUG.', 'SEPT.', 'OCT.', 'NOV.', 'DEC.'];

  const dayName = dayNames[eventDate.getDay()];
  const monthName = monthAbbrev[eventDate.getMonth()];
  const dayNum = eventDate.getDate();
  const dateHeader = `${dayName}, ${monthName} ${dayNum}`;
  const time = formatInTimeZone(eventDate, 'America/New_York', 'h:mm a');

  // Generate a beat scenario
  events.push({
    date: dateHeader,
    time,
    title: 'Consumer price index',
    period: 'Sept.',
    actual: '0.5%', // Beat forecast
    forecast: '0.4%',
    previous: '0.3%',
  });

  // Generate a miss scenario
  events.push({
    date: dateHeader,
    time,
    title: 'Initial jobless claims',
    period: 'Oct. 11',
    actual: '235,000', // Missed forecast
    forecast: '220,000',
    previous: '218,000',
  });

  return events;
}

/**
 * Generates events specifically for year rollover testing (Nov/Dec with Jan events)
 */
export function generateYearRolloverTestData(): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  // December event
  events.push({
    date: 'THURSDAY, DEC. 28',
    time: '8:30 am',
    title: 'Consumer confidence',
    period: 'Dec.',
    forecast: '95.0',
    previous: '94.2',
    actual: '',
  });

  // January events (next year)
  events.push({
    date: 'MONDAY, JAN. 5',
    time: '8:30 am',
    title: 'U.S. trade deficit',
    period: 'Nov.',
    forecast: '$-60.0B',
    previous: '-$58.5B',
    actual: '',
  });

  events.push({
    date: 'FRIDAY, JAN. 10',
    time: '10:00 am',
    title: 'Consumer sentiment (prelim)',
    period: 'Jan.',
    forecast: '55.0',
    previous: '53.5',
    actual: '',
  });

  return events;
}

/**
 * Saves test data to the storage file for testing
 */
export async function saveTestData(events: CalendarEvent[]): Promise<void> {
  const { saveEvents } = await import('../storage');
  await saveEvents(events);
  console.log(`✅ Saved ${events.length} test events to storage`);
}
