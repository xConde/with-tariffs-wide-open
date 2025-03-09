import axios from 'axios';
import * as cheerio from 'cheerio';
import { CalendarEvent } from './models/event';

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64)...Safari/537.36',
];

function getRandomUserAgent(): string {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

export async function scrapeEconomicCalendar(): Promise<CalendarEvent[]> {
  const url = 'https://www.marketwatch.com/economy-politics/calendar';
  const { data: html } = await axios.get(url, {
    headers: {
      'User-Agent': getRandomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.marketwatch.com/',
    },
  });
  const $ = cheerio.load(html);
  const events: CalendarEvent[] = [];
  let currentDate = '';

  $('div.element--tableblock table tbody tr').each((_, row) => {
    const tds = $(row).find('td');
    if (tds.length === 0) return;
    if ($(tds[0]).find('b').length > 0) {
      currentDate = $(tds[0]).find('b').text().trim();
      return;
    }
    const time = $(tds[0]).text().trim();
    const title = $(tds[1]).text().trim();
    if (title.toLowerCase().includes('none scheduled')) return;
    const period = $(tds[2]).text().trim();
    const actual = $(tds[3]).text().trim();
    const forecast = $(tds[4]).text().trim();
    const previous = $(tds[5]).text().trim();
    events.push({ date: currentDate, time, title, period, actual, forecast, previous });
  });

  return events;
}
