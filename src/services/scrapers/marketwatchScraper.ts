import axios from 'axios';
import * as cheerio from 'cheerio';
import { CalendarEvent } from '../../models/event';
import { SCRAPER_URL, SCRAPER_USER_AGENTS, SCRAPER_TIMEOUT_MS, SCRAPER_MAX_RESPONSE_BYTES } from '../../config/constants';
import { ICalendarScraper } from './ICalendarScraper';
import { createLogger } from '../../utils/logger';

const log = createLogger('scraper');

function getRandomUserAgent(): string {
  return SCRAPER_USER_AGENTS[Math.floor(Math.random() * SCRAPER_USER_AGENTS.length)];
}

/**
 * MarketWatch economic calendar scraper
 * Primary data source for US economic events
 */
export class MarketWatchScraper implements ICalendarScraper {
  readonly sourceName = 'MarketWatch';

  async isAvailable(): Promise<boolean> {
    try {
      const response = await axios.head(SCRAPER_URL, { timeout: 5000 });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async scrape(): Promise<CalendarEvent[]> {
    try {
      const url = SCRAPER_URL;
      const { data: html } = await axios.get(url, {
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.marketwatch.com/'
        },
        timeout: SCRAPER_TIMEOUT_MS,
        maxContentLength: SCRAPER_MAX_RESPONSE_BYTES,
        maxRedirects: 3,
      });

      const $ = cheerio.load(html);
      const events: CalendarEvent[] = [];
      let currentDate = '';

      const selectors = [
        'div.element--tableblock table tbody tr',
        'table.calendar tbody tr',
        '.economic-calendar table tbody tr',
        'table tbody tr',
      ];

      let rows: ReturnType<typeof $> | null = null;

      for (const selector of selectors) {
        const found = $(selector);
        if (found.length > 0) {
          rows = found;
          log.info(`Using selector: "${selector}" (found ${found.length} rows)`);
          break;
        }
      }

      if (!rows || rows.length === 0) {
        log.error('No table rows found with any selector');
        throw new Error('MarketWatch HTML structure may have changed - no table found');
      }

      rows.each((_: number, row: cheerio.Element) => {
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
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          log.error(`Scraper timeout after ${SCRAPER_TIMEOUT_MS}ms`);
          throw new Error(`MarketWatch request timed out after ${SCRAPER_TIMEOUT_MS / 1000}s`);
        }
        if (error.response) {
          log.error(`Returned ${error.response.status}: ${error.response.statusText}`);
          throw new Error(`MarketWatch HTTP ${error.response.status}`);
        }
        if (error.request) {
          log.error('No response (network issue)');
          throw new Error('Network error - no response from MarketWatch');
        }
      }
      log.error('Error scraping', { error: String(error) });
      throw error;
    }
  }
}

/**
 * Singleton instance
 */
export const marketwatchScraper = new MarketWatchScraper();

/**
 * Legacy function export for backwards compatibility
 * @deprecated Use marketwatchScraper.scrape() for new code
 */
export async function scrapeEconomicCalendar(): Promise<CalendarEvent[]> {
  return marketwatchScraper.scrape();
}
