import axios from 'axios';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { CalendarEvent } from '../../models/event';
import { SCRAPER_URL, SCRAPER_USER_AGENTS, SCRAPER_TIMEOUT_MS, SCRAPER_MAX_RESPONSE_BYTES } from '../../config/constants';
import { ICalendarScraper } from './ICalendarScraper';
import { createLogger } from '../../utils/logger';
import { ScraperError } from '../../errors';

const log = createLogger('scraper');

function getRandomUserAgent(): string {
  return SCRAPER_USER_AGENTS[Math.floor(Math.random() * SCRAPER_USER_AGENTS.length)];
}

/**
 * Returns true if the error is retryable (e.g. rate-limited, network failure).
 * HTTP 403 (Forbidden) is not retryable — the server is actively blocking us.
 */
export function isRetryableError(error: Error): boolean {
  if (error instanceof ScraperError) {
    return error.retryable;
  }
  return !error.message.includes('HTTP 403');
}

/**
 * MarketWatch economic calendar scraper
 * Primary data source for US economic events
 */
export class MarketWatchScraper implements ICalendarScraper {
  readonly sourceName = 'MarketWatch';

  private rateLimitedUntil: number = 0;

  async isAvailable(): Promise<boolean> {
    try {
      const response = await axios.head(SCRAPER_URL, { timeout: 5000 });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async scrape(): Promise<CalendarEvent[]> {
    if (Date.now() < this.rateLimitedUntil) {
      const waitSec = Math.ceil((this.rateLimitedUntil - Date.now()) / 1000);
      throw new ScraperError(`Rate limited — retry after ${waitSec}s`, true);
    }

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
        throw new ScraperError('MarketWatch HTML structure may have changed - no table found', false);
      }

      rows.each((_: number, row: AnyNode) => {
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

      // Structural sanity checks — detect column order shifts
      if (events.length > 0) {
        const emptyTimeCount = events.filter(e => !e.time).length;
        const emptyTitleCount = events.filter(e => !e.title).length;
        const emptyTimeRatio = emptyTimeCount / events.length;
        const emptyTitleRatio = emptyTitleCount / events.length;

        if (emptyTitleRatio > 0.8) {
          log.error('Structural anomaly: 80%+ events have empty titles — column mapping may have shifted');
          throw new ScraperError('MarketWatch HTML structure changed — title column empty', false);
        }
        // High empty-time ratio is normal (many TBA events), so only warn
        if (emptyTimeRatio > 0.9) {
          log.warn('Unusual: 90%+ events have empty time fields');
        }

        const datelikeTitle = events.filter(e => /^(\d{1,2}\/\d{1,2}|\d{4})$/.test(e.title)).length;
        if (datelikeTitle / events.length > 0.5) {
          log.error('Structural anomaly: titles look like dates/numbers — column mapping shifted');
          throw new ScraperError('MarketWatch HTML structure changed — title column contains non-text data', false);
        }
      }

      this.rateLimitedUntil = 0;
      return events;
    } catch (error) {
      if (error instanceof ScraperError) {
        throw error;
      }
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          log.error(`Scraper timeout after ${SCRAPER_TIMEOUT_MS}ms`);
          throw new ScraperError(`MarketWatch request timed out after ${SCRAPER_TIMEOUT_MS / 1000}s`, true, { cause: error });
        }
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers?.['retry-after'];
          const waitMs = retryAfter ? (parseInt(retryAfter, 10) || 60) * 1000 : 60_000;
          this.rateLimitedUntil = Date.now() + waitMs;
          log.warn('Rate limited by MarketWatch', { retryAfterMs: waitMs });
          throw new ScraperError(`MarketWatch rate limited (429) — retry after ${waitMs / 1000}s`, true, { cause: error });
        }
        if (error.response?.status === 403) {
          log.error(`Returned ${error.response.status}: ${error.response.statusText}`);
          throw new ScraperError(`MarketWatch HTTP ${error.response.status}`, false, { cause: error });
        }
        if (error.response) {
          log.error(`Returned ${error.response.status}: ${error.response.statusText}`);
          throw new ScraperError(`MarketWatch HTTP ${error.response.status}`, true, { cause: error });
        }
        if (error.request) {
          log.error('No response (network issue)');
          throw new ScraperError('Network error - no response from MarketWatch', true, { cause: error });
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
