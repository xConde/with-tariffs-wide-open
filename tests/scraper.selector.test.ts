import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import axios from 'axios';
import { MarketWatchScraper } from '../src/services/scrapers/marketwatchScraper';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

/**
 * Helper: wraps an inner HTML table structure in a full HTML page.
 */
function wrapHtml(body: string): string {
  return `<html><body>${body}</body></html>`;
}

/**
 * A date header row + one event row, reusable across selector tests.
 */
const DATE_HEADER = '<tr><td><b>WEDNESDAY, MAR. 5</b></td></tr>';
const EVENT_ROW = `<tr>
  <td>8:30 am</td>
  <td>GDP</td>
  <td>Q4</td>
  <td>2.8%</td>
  <td>2.6%</td>
  <td>2.5%</td>
</tr>`;
const SECOND_EVENT_ROW = `<tr>
  <td>10:00 am</td>
  <td>Consumer Confidence</td>
  <td>Mar.</td>
  <td></td>
  <td>98.0</td>
  <td>98.3</td>
</tr>`;

describe('MarketWatchScraper - Selector Fallbacks', () => {
  let scraper: MarketWatchScraper;

  beforeEach(() => {
    scraper = new MarketWatchScraper();
    jest.clearAllMocks();
  });

  it('should parse events using table.calendar selector (fallback 2)', async () => {
    const html = wrapHtml(`
      <table class="calendar"><tbody>
        ${DATE_HEADER}
        ${EVENT_ROW}
        ${SECOND_EVENT_ROW}
      </tbody></table>
    `);
    mockedAxios.get.mockResolvedValueOnce({ data: html });

    const events = await scraper.scrape();

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      date: 'WEDNESDAY, MAR. 5',
      time: '8:30 am',
      title: 'GDP',
      period: 'Q4',
      actual: '2.8%',
      forecast: '2.6%',
      previous: '2.5%',
    });
    expect(events[1].title).toBe('Consumer Confidence');
  });

  it('should parse events using .economic-calendar selector (fallback 3)', async () => {
    const html = wrapHtml(`
      <div class="economic-calendar">
        <table><tbody>
          ${DATE_HEADER}
          ${EVENT_ROW}
        </tbody></table>
      </div>
    `);
    mockedAxios.get.mockResolvedValueOnce({ data: html });

    const events = await scraper.scrape();

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      date: 'WEDNESDAY, MAR. 5',
      time: '8:30 am',
      title: 'GDP',
      period: 'Q4',
      actual: '2.8%',
      forecast: '2.6%',
      previous: '2.5%',
    });
  });

  it('should parse events using generic table tbody tr selector (fallback 4)', async () => {
    // Plain table with no special class or wrapper
    const html = wrapHtml(`
      <table><tbody>
        ${DATE_HEADER}
        ${EVENT_ROW}
      </tbody></table>
    `);
    mockedAxios.get.mockResolvedValueOnce({ data: html });

    const events = await scraper.scrape();

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('GDP');
    expect(events[0].date).toBe('WEDNESDAY, MAR. 5');
  });

  it('should throw when no table exists in the HTML', async () => {
    const html = wrapHtml(`
      <div class="content">
        <p>No economic data available today.</p>
      </div>
    `);
    mockedAxios.get.mockResolvedValueOnce({ data: html });

    await expect(scraper.scrape()).rejects.toThrow('MarketWatch HTML structure may have changed');
  });

  it('should return empty array when table exists but has no event rows', async () => {
    // Table with only a date header row and a "None scheduled" row
    const html = wrapHtml(`
      <table class="calendar"><tbody>
        ${DATE_HEADER}
        <tr>
          <td>8:30 am</td>
          <td>None scheduled</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
      </tbody></table>
    `);
    mockedAxios.get.mockResolvedValueOnce({ data: html });

    const events = await scraper.scrape();

    expect(events).toHaveLength(0);
  });

  it('should prefer more specific selector over generic fallback', async () => {
    // HTML that matches both table.calendar (selector 2) and table tbody tr (selector 4).
    // The scraper should pick selector 2 first.
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const html = wrapHtml(`
      <table class="calendar"><tbody>
        ${DATE_HEADER}
        ${EVENT_ROW}
      </tbody></table>
    `);
    mockedAxios.get.mockResolvedValueOnce({ data: html });

    await scraper.scrape();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('table.calendar tbody tr')
    );
    consoleSpy.mockRestore();
  });

  it('should track date across multiple rows with fallback selector', async () => {
    const html = wrapHtml(`
      <div class="economic-calendar">
        <table><tbody>
          <tr><td><b>MONDAY, MAR. 3</b></td></tr>
          ${EVENT_ROW}
          <tr><td><b>TUESDAY, MAR. 4</b></td></tr>
          ${SECOND_EVENT_ROW}
        </tbody></table>
      </div>
    `);
    mockedAxios.get.mockResolvedValueOnce({ data: html });

    const events = await scraper.scrape();

    expect(events).toHaveLength(2);
    expect(events[0].date).toBe('MONDAY, MAR. 3');
    expect(events[1].date).toBe('TUESDAY, MAR. 4');
  });
});
