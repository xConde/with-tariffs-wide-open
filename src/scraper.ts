/**
 * Legacy scraper module - Re-exports from services/scrapers
 *
 * @deprecated This file maintained for backwards compatibility.
 * For new features, import from services/scrapers/marketwatchScraper.ts
 *
 * Future: Will support multiple scrapers (FRED, Investing.com, etc.)
 * via scraperOrchestrator pattern.
 */

export { scrapeEconomicCalendar, marketwatchScraper } from './services/scrapers/marketwatchScraper';
