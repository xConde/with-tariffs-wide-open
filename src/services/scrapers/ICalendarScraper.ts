import { CalendarEvent } from '../../models/event';

/**
 * Interface for calendar data scrapers
 * Allows multiple data sources (MarketWatch, FRED, Investing.com, etc.)
 */
export interface ICalendarScraper {
  /**
   * Name of the data source
   */
  readonly sourceName: string;

  /**
   * Scrapes economic calendar events
   * @returns Array of CalendarEvent objects
   * @throws Error if scraping fails (timeout, network, parsing)
   */
  scrape(): Promise<CalendarEvent[]>;

  /**
   * Validates that this scraper is accessible
   * @returns true if source is reachable, false otherwise
   */
  isAvailable(): Promise<boolean>;
}
