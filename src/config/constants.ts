/**
 * Application-wide constants for the Discord Economic Calendar Bot
 */

// Pagination
export const DATES_PER_PAGE = 5;

// Notification timings (in minutes)
export const NOTIFICATION_EARLY_WARNING_MINUTES = 30;
export const NOTIFICATION_FINAL_WARNING_MINUTES = 1;

// Post-event update delay (in milliseconds)
export const POST_EVENT_UPDATE_DELAY_MS = 90000; // 90 seconds

// Timezone
export const SOURCE_TIMEZONE = 'America/New_York'; // MarketWatch data is in ET
export const DISPLAY_TIMEZONE = process.env.DISPLAY_TIMEZONE || 'America/Chicago'; // User display preference

// Scheduler settings
export const DAILY_SCRAPE_SCHEDULE = '0 3 * * *'; // 3 AM daily
export const DAILY_SCRAPE_TIMEZONE = 'America/New_York';
export const SCRAPER_MAX_RETRIES = 3;
export const SCRAPER_RETRY_DELAY_MS = 60000; // 1 minute

// Scraper settings
export const SCRAPER_URL = 'https://www.marketwatch.com/economy-politics/calendar';
export const SCRAPER_TIMEOUT_MS = 15000; // 15 seconds - prevents indefinite hangs
export const SCRAPER_MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5MB - prevents OOM from malicious responses
export const SCRAPER_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
];

// Data validation
export const SCRAPER_MIN_EVENTS = 5;
export const SCRAPER_MAX_EVENTS = 500; // Upper bound — MarketWatch typically returns 20-80 events

// Cache cleanup
export const CALENDAR_CACHE_MAX_AGE_MS = 3600000; // 1 hour
export const CALENDAR_CACHE_MAX_SIZE = 100;
export const NOTIFICATION_TIMEOUT_CLEANUP_MS = 7200000; // 2 hours — remove timeouts for events this far in the past
export const CACHE_CLEANUP_INTERVAL_MS = 3600000; // 1 hour — how often periodic cleanup runs

// Health check
export const HEARTBEAT_INTERVAL_MS = 60000; // 1 minute
export const HEARTBEAT_MAX_AGE_MS = 120000; // 2 minutes

// Discord reconnect
export const MAX_RECONNECT_ATTEMPTS = 5;
export const RECONNECT_BASE_DELAY_MS = 5000; // 5 seconds, multiplied by attempt number

// Discord embed colors
export const EMBED_COLOR_DEFAULT = 0x7289da;
export const EMBED_COLOR_WARNING_30MIN = 0xf1c40f; // Yellow
export const EMBED_COLOR_WARNING_1MIN = 0xff8c00; // Dark orange
export const EMBED_COLOR_SUCCESS = 0x2ecc71; // Green (beat forecast)
export const EMBED_COLOR_FAILURE = 0xe74c3c; // Red (missed forecast)

// Environment variables (with defaults for documentation)
export const ENV_VARS = {
  DISCORD_TOKEN: 'DISCORD_TOKEN',
  DISCORD_CHANNEL_ID: 'DISCORD_CHANNEL_ID',
  CLIENT_ID: 'CLIENT_ID',
  GUILD_ID: 'GUILD_ID',
  FAKE_DATE: 'FAKE_DATE',
  RESCRAPE: 'RESCRAPE',
  DISPLAY_TIMEZONE: 'DISPLAY_TIMEZONE',
  ADMIN_USER_ID: 'ADMIN_USER_ID',
  FALLBACK_CHANNEL_ID: 'FALLBACK_CHANNEL_ID',
} as const;

// Timezone abbreviations for display
export const TIMEZONE_ABBREV: Record<string, string> = {
  'America/New_York': 'ET',
  'America/Chicago': 'CT',
  'America/Denver': 'MT',
  'America/Los_Angeles': 'PT',
  'America/Phoenix': 'MST',
  'America/Anchorage': 'AKT',
  'Pacific/Honolulu': 'HST',
};
