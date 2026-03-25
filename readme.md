# Economic Calendar Discord Bot `with-tariffs-wide-open`

A production-ready Discord bot that scrapes economic calendar events from [MarketWatch](https://www.marketwatch.com/economy-politics/calendar) and delivers them via slash commands with intelligent notifications. Built with TypeScript, featuring comprehensive testing infrastructure, timezone-aware display, and robust error handling.

[![Watch the video](https://img.youtube.com/vi/MVBy7bKlqaU/maxresdefault.jpg)](https://www.youtube.com/watch?v=MVBy7bKlqaU)

---

## Core Features

### **Calendar Display (`/calendar` command)**
- **Mobile-friendly multi-page embeds** with Previous/Next button navigation
- **Date grouping** - Consolidated date headings for cleaner display
- **Smart filtering** - Only shows upcoming events, filters past data
- **Timezone-aware** - Display times in your local timezone (e.g., "8:30 am ET (7:30 am CT)")
- **Fallback re-scrape** - If no data exists, scrapes on-demand

### **Intelligent Notifications**
- **30-minute warning** - Yellow alert before events
- **1-minute warning** - Orange final alert
- **Post-event updates** - Automatically scrapes actual values 90 seconds after event
- **Performance indicators** - Shows "↑ Higher" (beat forecast) or "↓ Lower" (missed)
- **Smart grouping** - Events at same time grouped into single notification

### **Automation & Reliability**
- **Daily auto-scrape** - Cron job at 3 AM EST updates all data
- **Error recovery** - 3 retry attempts with exponential backoff
- **Auto-reconnect** - Recovers from Discord disconnects (5x, backoff)
- **Notification persistence** - Notifications survive bot restarts
- **Graceful shutdown** - Proper cleanup on SIGTERM/SIGINT
- **Admin alerts** - DM notification when scraper or reconnect fails

---

## Technologies Used

- [Node.js](https://nodejs.org/) (≥18.0.0)
- [discord.js v14](https://discord.js.org/) - Discord API wrapper
- [TypeScript](https://www.typescriptlang.org/) - Type safety & strict compilation
- [axios](https://axios-http.com/) - HTTP requests
- [cheerio](https://cheerio.js.org/) - HTML parsing
- [node-cron](https://www.npmjs.com/package/node-cron) - Scheduled tasks
- [date-fns](https://date-fns.org/) & [date-fns-tz](https://github.com/marnusw/date-fns-tz) - Timezone handling
- [Jest](https://jestjs.io/) + [ts-jest](https://kulshekhar.github.io/ts-jest/) - Testing framework

---

## Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/xConde/with-tariffs-wide-open.git
cd with-tariffs-wide-open
npm install
```

### 2. Configure Environment
Create a `.env` file in the project root:

```bash
# Required
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CHANNEL_ID=your_discord_channel_id
CLIENT_ID=your_client_id

# Optional
GUILD_ID=your_guild_id                        # For guild-specific commands (faster updates)
DISPLAY_TIMEZONE=America/Chicago              # Your local timezone (defaults to Central)
ADMIN_USER_ID=your_discord_user_id           # Receives failure alerts via DM
FALLBACK_CHANNEL_ID=backup_channel_id        # Backup notification channel
LOG_LEVEL=info                                # debug | info | warn | error
LOG_FORMAT=text                               # text | json
FAKE_DATE=2025-03-17T07:28:58.000Z           # For time-travel testing
RESCRAPE=1                                    # Force data update on startup
```

### 3. Build & Start
```bash
npm run build
npm run start
```

The bot will:
1. Validate environment variables
2. Deploy slash commands to Discord
3. Log in to Discord
4. Schedule daily scraper (3 AM EST)
5. Schedule notifications for upcoming events

---

## Usage

### `/calendar` Command

Type `/calendar` in your Discord server to:
- View upcoming economic events in paginated embeds
- Navigate with "Previous page" and "Next page" buttons
- See times in your configured timezone (if `DISPLAY_TIMEZONE` set)
- Get real-time data (auto-updated daily at 3 AM EST)

**Example Display:**
```
Economic Calendar                                    Page 1 of 3

TUESDAY, OCT. 7
• 8:30 am ET (7:30 am CT) - U.S. trade deficit (F: $-60.7B | P: -$78.3B)
• 10:00 am ET (9:00 am CT) - Atlanta Fed President Raphael Bostic speaks
• 3:00 pm ET (2:00 pm CT) - Consumer credit (F: $14.0B | P: $16.0B)

WEDNESDAY, OCT. 8
• 8:30 am ET (7:30 am CT) - Consumer price index (F: 0.4% | P: 0.3%)
...
```

### Notifications

The bot automatically sends alerts to the configured channel:

**30-Minute Warning (Yellow):**
```
Events — 30-Minutes Alert

• Consumer Price Index
  Forecast: 0.4% | Prev: 0.3%
```

**1-Minute Warning (Orange):**
```
Events — 1-Minute Alert

• Consumer Price Index
  Forecast: 0.4% | Prev: 0.3%
```

**Post-Event Update:**
```
Event Results

• Consumer Price Index
  Actual: 0.5% ↑ Higher
  Forecast: 0.4%
  Prev: 0.3%
```

Post-event color coding:
- Green = Beat forecast (actual > forecast)
- Red = Missed forecast (actual < forecast)
- Blue = Met expectations (actual = forecast)

---

## Architecture

### High-Level Data Flow
```
MarketWatch (Live Data)
       ↓
   Scraper (axios + cheerio)
       ↓ 15s timeout, 4 selector fallbacks, 3 retries
   Storage (JSON persistence)
       ↓ Validation before save, atomic writes
   ┌──────────────┬──────────────┐
   ↓              ↓              ↓
Calendar      Scheduler    Notifier
Command      (Cron 3AM)   (30m/1m alerts)
   ↓              ↓              ↓
Discord       Re-scrape    Discord
Display       & Refresh    Notifications
```

### Project Structure

```
with-tariffs-wide-open/
├── src/
│   ├── core/
│   │   └── discordClient.ts           # Shared Discord client singleton
│   ├── commands/
│   │   └── calendar.ts                # /calendar command implementation
│   ├── config/
│   │   └── constants.ts               # Application-wide constants
│   ├── events/
│   │   └── notifierMessage.ts         # Notification embed builders
│   ├── models/
│   │   └── event.ts                   # CalendarEvent interface
│   ├── services/scrapers/
│   │   ├── ICalendarScraper.ts        # Scraper interface
│   │   └── marketwatchScraper.ts      # MarketWatch implementation
│   ├── scripts/                       # CLI testing/utility scripts
│   │   ├── generateTestData.ts
│   │   ├── viewTestData.ts
│   │   ├── testLiveScrape.ts
│   │   ├── testTriggerCron.ts
│   │   ├── testTriggerNotification.ts
│   │   └── testFullFlow.ts
│   ├── utils/
│   │   ├── alerting.ts                # Admin DM alerts
│   │   ├── cacheCleanup.ts            # Memory management
│   │   ├── channelValidation.ts       # Channel permission checks
│   │   ├── dataValidation.ts          # Event data validation
│   │   ├── dateParser.ts              # Shared date normalization
│   │   ├── healthCheck.ts             # Heartbeat file writer
│   │   ├── logger.ts                  # Structured logging
│   │   ├── notificationPersistence.ts # Persist/restore notifications
│   │   ├── shutdown.ts                # Graceful shutdown handlers
│   │   ├── testDataGenerator.ts       # Test data generation logic
│   │   └── timezoneDisplay.ts         # Timezone conversion
│   ├── discordBot.ts                  # Discord client setup & reconnect
│   ├── scraper.ts                     # Legacy re-export shim
│   ├── storage.ts                     # JSON file persistence
│   ├── scheduler.ts                   # Cron job for daily updates
│   ├── notifier.ts                    # Notification scheduling
│   ├── globalSetup.ts                 # Environment setup & FAKE_DATE
│   ├── deploy-commands.ts             # Slash command deployment
│   ├── errors.ts                      # Custom error types
│   └── index.ts                       # Application entry point
├── data/
│   ├── events.json                    # Scraped event storage
│   └── notification-state.json        # Notification persistence
├── heartbeat.txt                      # Health status (updated every 60s)
├── Dockerfile                         # Multi-stage production build
├── docker-compose.yml
└── .github/workflows/ci.yml           # CI: build + test on PR/push
```

### Module Responsibilities

| Module | Purpose | Key Functions |
|--------|---------|---------------|
| **marketwatchScraper.ts** | Fetch data from MarketWatch | `scrape()` |
| **storage.ts** | Persist events to JSON | `saveEvents()`, `getStoredEvents()` |
| **scheduler.ts** | Daily 3 AM cron job | `updateCalendarEvents()` |
| **notifier.ts** | Schedule & send alerts | `scheduleNotifications()`, `refreshNotifications()` |
| **commands/calendar.ts** | Discord /calendar command | `execute()`, `buildCalendarEmbed()` |
| **discordBot.ts** | Discord client & interactions | `initializeDiscordBot()`, `sendEmbed()` |
| **globalSetup.ts** | Environment & FAKE_DATE | `waitForInitialSetup()` |

---

## Environment Variables

#### Required
| Variable | Description | Example |
|----------|-------------|---------|
| `DISCORD_TOKEN` | Bot authentication token | `MTE2Nz...` |
| `DISCORD_CHANNEL_ID` | Channel for notifications | `1234567890` |
| `CLIENT_ID` | Discord application client ID | `1167...` |

#### Optional
| Variable | Description | Default |
|----------|-------------|---------|
| `GUILD_ID` | Guild ID for faster command updates | None (global) |
| `DISPLAY_TIMEZONE` | User's display timezone | `America/Chicago` |
| `ADMIN_USER_ID` | Receives scraper/reconnect failure DMs | None |
| `FALLBACK_CHANNEL_ID` | Backup notification channel | None |
| `LOG_LEVEL` | Log threshold | `info` |
| `LOG_FORMAT` | Log output format | `text` |
| `FAKE_DATE` | Override system time (ISO 8601, testing) | None |
| `RESCRAPE` | Force scrape on startup | `0` |

**Supported timezones:** All IANA identifiers — `America/New_York`, `America/Chicago`, `America/Denver`, `America/Los_Angeles`, `America/Phoenix`, `America/Anchorage`, `Pacific/Honolulu`

---

## Deployment

```bash
# Build and run directly
npm run build && npm run start

# With PM2
pm2 start npm --name "calendar-bot" -- start
pm2 startup && pm2 save

# With Docker
docker build -t calendar-bot .
docker run -d --name calendar-bot --env-file .env calendar-bot
```

See [GUIDE.md](GUIDE.md) for detailed testing, troubleshooting, development standards, and Docker health monitoring.

---

## License & Disclaimer

**MIT License** - See [LICENSE](LICENSE) for full terms

**EDUCATIONAL USE ONLY** - See [DISCLAIMER.md](DISCLAIMER.md) for important legal notices

**TL;DR:**
- Personal educational learning project
- NOT for commercial use or financial trading
- NO warranty on data accuracy
- You are responsible for complying with MarketWatch's Terms of Service
- Use at your own risk

**By using this software, you agree to the terms in [DISCLAIMER.md](DISCLAIMER.md)**

---

Built by [@xConde](https://github.com/xConde)
