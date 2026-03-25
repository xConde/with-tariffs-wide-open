import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import axios from 'axios';
import { SCRAPER_TIMEOUT_MS, SCRAPER_URL } from '../src/config/constants';
import { MarketWatchScraper, isRetryableError } from '../src/services/scrapers/marketwatchScraper';
import { ScraperError } from '../src/errors';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const SAMPLE_HTML = `
<html><body>
<div class="element--tableblock">
  <table><tbody>
    <tr><td><b>MONDAY, FEB. 3</b></td></tr>
    <tr>
      <td>8:30 am</td>
      <td>Nonfarm Payrolls</td>
      <td>Jan.</td>
      <td>256K</td>
      <td>160K</td>
      <td>212K</td>
    </tr>
    <tr>
      <td>10:00 am</td>
      <td>ISM Manufacturing</td>
      <td>Jan.</td>
      <td></td>
      <td>49.5%</td>
      <td>49.3%</td>
    </tr>
    <tr><td><b>TUESDAY, FEB. 4</b></td></tr>
    <tr>
      <td>TBA</td>
      <td>Auto Sales</td>
      <td>Jan.</td>
      <td></td>
      <td></td>
      <td>16.8M</td>
    </tr>
    <tr>
      <td>8:30 am</td>
      <td>None scheduled</td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
    </tr>
  </tbody></table>
</div>
</body></html>
`;

describe('MarketWatchScraper', () => {
  let scraper: MarketWatchScraper;

  beforeEach(() => {
    scraper = new MarketWatchScraper();
    jest.clearAllMocks();
  });

  describe('scrape()', () => {
    it('should parse events from MarketWatch HTML', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: SAMPLE_HTML });

      const events = await scraper.scrape();

      expect(events.length).toBe(3); // 2 real events + 1 TBA, "None scheduled" filtered
      expect(events[0]).toEqual({
        date: 'MONDAY, FEB. 3',
        time: '8:30 am',
        title: 'Nonfarm Payrolls',
        period: 'Jan.',
        actual: '256K',
        forecast: '160K',
        previous: '212K',
      });
    });

    it('should track current date across rows', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: SAMPLE_HTML });

      const events = await scraper.scrape();

      expect(events[0].date).toBe('MONDAY, FEB. 3');
      expect(events[1].date).toBe('MONDAY, FEB. 3');
      expect(events[2].date).toBe('TUESDAY, FEB. 4');
    });

    it('should filter out "None scheduled" entries', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: SAMPLE_HTML });

      const events = await scraper.scrape();
      const titles = events.map(e => e.title);

      expect(titles).not.toContain('None scheduled');
    });

    it('should preserve TBA time entries', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: SAMPLE_HTML });

      const events = await scraper.scrape();
      const tbaEvent = events.find(e => e.time === 'TBA');

      expect(tbaEvent).toBeDefined();
      expect(tbaEvent?.title).toBe('Auto Sales');
    });

    it('should pass timeout to axios', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: SAMPLE_HTML });

      await scraper.scrape();

      expect(mockedAxios.get).toHaveBeenCalledWith(
        SCRAPER_URL,
        expect.objectContaining({ timeout: SCRAPER_TIMEOUT_MS })
      );
    });

    it('should throw on empty HTML with no table', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: '<html><body>No table here</body></html>' });

      await expect(scraper.scrape()).rejects.toThrow('MarketWatch HTML structure may have changed');
    });

    it('should throw structured error on timeout', async () => {
      const timeoutError = new Error('timeout');
      Object.assign(timeoutError, { code: 'ECONNABORTED', isAxiosError: true });
      mockedAxios.get.mockRejectedValueOnce(timeoutError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(scraper.scrape()).rejects.toThrow(/timed out/);
    });

    it('should set rateLimitedUntil and throw on 429 response', async () => {
      const error = new Error('Request failed with status code 429');
      Object.assign(error, {
        isAxiosError: true,
        code: undefined,
        response: { status: 429, statusText: 'Too Many Requests', headers: {} },
        request: undefined,
      });
      mockedAxios.get.mockRejectedValueOnce(error);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(scraper.scrape()).rejects.toThrow(/rate limited \(429\)/i);

      // rateLimitedUntil should now be in the future
      // @ts-expect-error accessing private for test
      expect(scraper.rateLimitedUntil).toBeGreaterThan(Date.now());
    });

    it('should throw without making HTTP request when still rate limited', async () => {
      const error429 = new Error('Request failed with status code 429');
      Object.assign(error429, {
        isAxiosError: true,
        code: undefined,
        response: { status: 429, statusText: 'Too Many Requests', headers: {} },
        request: undefined,
      });
      mockedAxios.get.mockRejectedValueOnce(error429);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(scraper.scrape()).rejects.toThrow(/rate limited/i);

      // Second call — should throw before axios.get is invoked again
      await expect(scraper.scrape()).rejects.toThrow(/Rate limited — retry after/);
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it('should clear rate limit after successful scrape', async () => {
      // Seed a past rate limit so the first scrape is allowed through
      // @ts-expect-error accessing private for test
      scraper.rateLimitedUntil = Date.now() - 1;

      mockedAxios.get.mockResolvedValueOnce({ data: SAMPLE_HTML });
      const events = await scraper.scrape();
      expect(events.length).toBeGreaterThan(0);

      // @ts-expect-error accessing private for test
      expect(scraper.rateLimitedUntil).toBe(0);
    });

    it('should parse Retry-After header to set cooldown duration', async () => {
      const error429 = new Error('Request failed with status code 429');
      Object.assign(error429, {
        isAxiosError: true,
        code: undefined,
        response: {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'retry-after': '120' },
        },
        request: undefined,
      });
      mockedAxios.get.mockRejectedValueOnce(error429);
      mockedAxios.isAxiosError.mockReturnValue(true);

      const before = Date.now();
      await expect(scraper.scrape()).rejects.toThrow('retry after 120s');

      // @ts-expect-error accessing private for test
      expect(scraper.rateLimitedUntil).toBeGreaterThanOrEqual(before + 120_000);
    });

    it('should throw with HTTP 403 status in message', async () => {
      const error = new Error('Request failed with status code 403');
      Object.assign(error, {
        isAxiosError: true,
        code: undefined,
        response: { status: 403, statusText: 'Forbidden' },
        request: undefined,
      });
      mockedAxios.get.mockRejectedValueOnce(error);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(scraper.scrape()).rejects.toThrow('MarketWatch HTTP 403');
    });

    it('should throw Network error when request was made but no response received', async () => {
      const error = new Error('Network Error');
      Object.assign(error, {
        isAxiosError: true,
        code: undefined,
        response: undefined,
        request: {},
      });
      mockedAxios.get.mockRejectedValueOnce(error);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(scraper.scrape()).rejects.toThrow('Network error');
    });

    it('should return events with empty date when no bold date headers are present', async () => {
      const htmlNoBoldHeaders = `
<html><body>
<table><tbody>
  <tr>
    <td>8:30 am</td>
    <td>Nonfarm Payrolls</td>
    <td>Jan.</td>
    <td>256K</td>
    <td>160K</td>
    <td>212K</td>
  </tr>
  <tr>
    <td>10:00 am</td>
    <td>ISM Manufacturing</td>
    <td>Jan.</td>
    <td></td>
    <td>49.5%</td>
    <td>49.3%</td>
  </tr>
</tbody></table>
</body></html>
`;
      mockedAxios.get.mockResolvedValueOnce({ data: htmlNoBoldHeaders });

      const events = await scraper.scrape();

      expect(events.length).toBe(2);
      expect(events[0].date).toBe('');
      expect(events[1].date).toBe('');
    });
  });

  describe('isAvailable()', () => {
    it('should return true when MarketWatch responds 200', async () => {
      mockedAxios.head.mockResolvedValueOnce({ status: 200 });

      expect(await scraper.isAvailable()).toBe(true);
    });

    it('should return false on network error', async () => {
      mockedAxios.head.mockRejectedValueOnce(new Error('Network error'));

      expect(await scraper.isAvailable()).toBe(false);
    });
  });

  describe('sourceName', () => {
    it('should identify as MarketWatch', () => {
      expect(scraper.sourceName).toBe('MarketWatch');
    });
  });
});

describe('isRetryableError', () => {
  it('should return true for rate-limited (429) errors', () => {
    expect(isRetryableError(new Error('MarketWatch rate limited (429) — retry after 60s'))).toBe(true);
  });

  it('should return true for network errors', () => {
    expect(isRetryableError(new Error('Network error - no response from MarketWatch'))).toBe(true);
  });

  it('should return true for timeout errors', () => {
    expect(isRetryableError(new Error('MarketWatch request timed out after 15s'))).toBe(true);
  });

  it('should return false for HTTP 403 errors', () => {
    expect(isRetryableError(new Error('MarketWatch HTTP 403'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Structural validation tests
// ---------------------------------------------------------------------------

function buildHtmlFromRows(rows: string[]): string {
  return `<html><body><div class="element--tableblock"><table><tbody>${rows.join('')}</tbody></table></div></body></html>`;
}

function makeDateRow(label: string): string {
  return `<tr><td><b>${label}</b></td></tr>`;
}

function makeEventRow(time: string, title: string): string {
  return `<tr><td>${time}</td><td>${title}</td><td>Jan.</td><td></td><td>100K</td><td>90K</td></tr>`;
}

describe('MarketWatchScraper — structural validation', () => {
  let scraper: MarketWatchScraper;

  beforeEach(() => {
    scraper = new MarketWatchScraper();
    jest.clearAllMocks();
  });

  it('should pass validation for normal events and return them', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: SAMPLE_HTML });

    const events = await scraper.scrape();

    expect(events.length).toBeGreaterThan(0);
    events.forEach(e => expect(e.title).toBeTruthy());
  });

  it('should throw non-retryable ScraperError when 80%+ events have empty titles', async () => {
    const rows = [
      makeDateRow('MONDAY, FEB. 3'),
      // 5 events with empty title, 1 with real title → 83% empty
      makeEventRow('8:30 am', ''),
      makeEventRow('9:00 am', ''),
      makeEventRow('9:30 am', ''),
      makeEventRow('10:00 am', ''),
      makeEventRow('10:30 am', ''),
      makeEventRow('11:00 am', 'Nonfarm Payrolls'),
    ];
    mockedAxios.get.mockResolvedValueOnce({ data: buildHtmlFromRows(rows) });

    let thrown: unknown;
    try {
      await scraper.scrape();
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ScraperError);
    expect((thrown as ScraperError).message).toBe('MarketWatch HTML structure changed — title column empty');
    expect((thrown as ScraperError).retryable).toBe(false);
  });

  it('should throw non-retryable ScraperError when 50%+ titles look like dates', async () => {
    const rows = [
      makeDateRow('MONDAY, FEB. 3'),
      // Titles that look like dates/numbers — column mapping shifted
      makeEventRow('8:30 am', '01/01'),
      makeEventRow('9:00 am', '2025'),
      makeEventRow('9:30 am', '12/31'),
      makeEventRow('10:00 am', 'Nonfarm Payrolls'),
    ];
    mockedAxios.get.mockResolvedValueOnce({ data: buildHtmlFromRows(rows) });

    let thrown: unknown;
    try {
      await scraper.scrape();
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ScraperError);
    expect((thrown as ScraperError).message).toBe('MarketWatch HTML structure changed — title column contains non-text data');
    expect((thrown as ScraperError).retryable).toBe(false);
  });

  it('should log a warning but not throw when 90%+ events have empty time fields', async () => {
    const rows = [
      makeDateRow('MONDAY, FEB. 3'),
      // 10 events with empty time, 1 with real time → 91% empty
      makeEventRow('', 'Event A'),
      makeEventRow('', 'Event B'),
      makeEventRow('', 'Event C'),
      makeEventRow('', 'Event D'),
      makeEventRow('', 'Event E'),
      makeEventRow('', 'Event F'),
      makeEventRow('', 'Event G'),
      makeEventRow('', 'Event H'),
      makeEventRow('', 'Event I'),
      makeEventRow('', 'Event J'),
      makeEventRow('8:30 am', 'Event K'),
    ];
    mockedAxios.get.mockResolvedValueOnce({ data: buildHtmlFromRows(rows) });

    // Should resolve without throwing
    const events = await scraper.scrape();

    expect(events.length).toBe(11);
    // All titles are present — validation passes
    events.forEach(e => expect(e.title).toBeTruthy());
  });
});
