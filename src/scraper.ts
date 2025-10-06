import axios from 'axios';
import * as cheerio from 'cheerio';
import { CalendarEvent } from './models/event';
import { SCRAPER_URL, SCRAPER_USER_AGENTS } from './config/constants';

function getRandomUserAgent(): string {
  return SCRAPER_USER_AGENTS[Math.floor(Math.random() * SCRAPER_USER_AGENTS.length)];
}

export async function scrapeEconomicCalendar(): Promise<CalendarEvent[]> {
  try {
    const url = SCRAPER_URL;
    const { data: html } = await axios.get(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.marketwatch.com/'
      }
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
  } catch (error) {
    console.error('Error scraping economic calendar:', error);
    throw error;
  }
}
