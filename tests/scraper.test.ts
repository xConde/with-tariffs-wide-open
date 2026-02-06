import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import axios from 'axios';
import { SCRAPER_TIMEOUT_MS, SCRAPER_URL } from '../src/config/constants';
import { MarketWatchScraper } from '../src/services/scrapers/marketwatchScraper';

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
