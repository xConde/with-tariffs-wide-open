# Economic Calendar Discord Bot `with-tariffs-wide-open`

A production-ready Discord bot that scrapes economic calendar events from [MarketWatch](https://www.marketwatch.com/economy-politics/calendar) and delivers them via slash commands with intelligent notifications. Built with TypeScript, featuring comprehensive testing infrastructure, timezone-aware display, and robust error handling.

[![Watch the video](https://img.youtube.com/vi/MVBy7bKlqaU/maxresdefault.jpg)](https://www.youtube.com/watch?v=MVBy7bKlqaU)

---

## Core Features

### 📅 **Calendar Display (`/calendar` command)**
- **Mobile-friendly multi-page embeds** with Previous/Next button navigation
- **Date grouping** - Consolidated date headings for cleaner display
- **Smart filtering** - Only shows upcoming events, filters past data
- **Timezone-aware** - Display times in your local timezone (e.g., "8:30 am ET (7:30 am CT)")
- **Fallback re-scrape** - If no data exists, scrapes on-demand

### 🔔 **Intelligent Notifications**
- **30-minute warning** - Yellow alert before events
- **1-minute warning** - Orange final alert
- **Post-event updates** - Automatically scrapes actual values 90 seconds after event
- **Performance indicators** - Shows "↑ Higher" (beat forecast) or "↓ Lower" (missed)
- **Smart grouping** - Events at same time grouped into single notification

### **Automation & Reliability**
- **Daily auto-scrape** - Cron job at 3 AM EST updates all data
- **Error recovery** - 3 retry attempts with exponential backoff
- **Memory management** - Automatic cache cleanup prevents leaks
- **Graceful shutdown** - Proper cleanup on SIGTERM/SIGINT
- **User-agent rotation** - Avoids rate limiting from MarketWatch

### **Testing Infrastructure**
- **34 automated tests** - Unit + integration test coverage
- **4 live flow scripts** - Test scraper, cron, notifications, full E2E
- **Test data generator** - Create realistic data without hitting MarketWatch
- **FAKE_DATE support** - Time-travel testing for date-dependent features

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
6. Start periodic cache cleanup

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

**30-Minute Warning (Yellow ):**
```
Events — 30-Minutes Alert

• Consumer Price Index
  Forecast: 0.4% | Prev: 0.3%
```

**1-Minute Warning (Orange 🟠):**
```
Events — 1-Minute Alert

• Consumer Price Index
  Forecast: 0.4% | Prev: 0.3%
```

**Post-Event Update (Green/Red ):**
```
Event Results

• Consumer Price Index
  Actual: 0.5% ↑ Higher
  Forecast: 0.4%
  Prev: 0.3%
```

Colors:
-  Green = Beat forecast (actual > forecast)
-  Red = Missed forecast (actual < forecast)
-  Blue = Met expectations (actual = forecast)

---

## Testing & Development

### Automated Testing

```bash
npm test                    # Run all tests (34 passing)
npm run test:watch          # Watch mode for development
npm run test:coverage       # Generate coverage report
npm run test:integration    # Integration tests only
```

**Test Coverage:**
- Date parsing & year rollover logic
- Beat/miss prediction algorithms
- Pagination & grouping logic
- Memory cleanup utilities
- Data pipeline (generate → store → retrieve)

### Live Flow Testing

Test real-world scenarios using FAKE_DATE manipulation:

```bash
# Validate scraper against live MarketWatch data
npm run test:live-scrape

# Trigger daily 3 AM cron job in 60 seconds
npm run test:trigger-cron

# Trigger notification cycle in 1 minute
npm run test:trigger-notif

# Complete end-to-end health check
npm run test:full-flow
```

**See [GUIDE.md](GUIDE.md#testing) for detailed testing workflows.**

### Test Data Generation

Create realistic test data without hitting MarketWatch:

```bash
# Generate 14 days of future events
npm run test:generate-data

# Generate past events with actuals (for notification testing)
npm run test:generate-data past

# Generate year rollover test data (Dec/Jan)
npm run test:generate-data rollover

# View generated data
npm run test:view-data
```

**See [GUIDE.md](GUIDE.md#testing) for complete testing guide.**

---

## Architecture

**See [GUIDE.md](GUIDE.md) for comprehensive documentation including:**
- Complete architecture with all layers and components
- Testing workflows (automated + live flow scripts)
- Development standards and deployment guide
- Troubleshooting and reliability features
- **One complete reference** for everything

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
   ↓              ↓              ↓
Pagination   Admin Alert  Fallback Channel
```

### Project Structure

```
with-tariffs-wide-open/
├── .ai/                           # Claude AI configuration
│   ├── rules/                     # Code quality standards
│   │   ├── code-style.mdc         # TypeScript/Discord.js formatting
│   │   ├── workflow.mdc           # Development workflow
│   │   └── discord-bot-patterns.mdc
│   └── TESTING_FLOWS.md           # Complete testing guide
├── src/
│   ├── commands/                  # Discord slash commands
│   │   └── calendar.ts            # /calendar command implementation
│   ├── config/
│   │   └── constants.ts           # Application-wide constants
│   ├── events/
│   │   └── notifierMessage.ts     # Notification embed builders
│   ├── models/
│   │   └── event.ts               # CalendarEvent interface
│   ├── scripts/                   # Testing/utility scripts
│   │   ├── generateTestData.ts    # Test data generator CLI
│   │   ├── viewTestData.ts        # Data viewer
│   │   ├── testLiveScrape.ts      # Live scraper validation
│   │   ├── testTriggerCron.ts     # Cron trigger test
│   │   ├── testTriggerNotification.ts
│   │   └── testFullFlow.ts        # E2E health check
│   ├── utils/
│   │   ├── cacheCleanup.ts        # Memory management
│   │   ├── shutdown.ts            # Graceful shutdown handlers
│   │   ├── testDataGenerator.ts   # Test data generation logic
│   │   └── timezoneDisplay.ts     # Timezone conversion
│   ├── discordBot.ts              # Discord client setup
│   ├── scraper.ts                 # MarketWatch scraper
│   ├── storage.ts                 # JSON file persistence
│   ├── scheduler.ts               # Cron job for daily updates
│   ├── notifier.ts                # Notification scheduling
│   ├── globalSetup.ts             # Environment setup
│   └── index.ts                   # Application entry point
├── tests/                         # Test suites
│   ├── commands/                  # Command logic tests
│   ├── events/                    # Notification tests
│   ├── utils/                     # Utility tests
│   └── integration/               # Integration tests
├── data/
│   └── events.json                # Scraped event storage
├── dist/                          # Compiled JavaScript
└── coverage/                      # Test coverage reports
```

### Module Responsibilities

| Module | Purpose | Key Functions |
|--------|---------|---------------|
| **scraper.ts** | Fetch data from MarketWatch | `scrapeEconomicCalendar()` |
| **storage.ts** | Persist events to JSON | `saveEvents()`, `getStoredEvents()` |
| **scheduler.ts** | Daily 3 AM cron job | `updateCalendarEvents()` |
| **notifier.ts** | Schedule & send alerts | `scheduleNotifications()`, `refreshNotifications()` |
| **commands/calendar.ts** | Discord /calendar command | `execute()`, `buildCalendarEmbed()` |
| **discordBot.ts** | Discord client & interactions | `initializeDiscordBot()`, `sendEmbed()` |
| **globalSetup.ts** | Environment & FAKE_DATE | `waitForInitialSetup()` |

---

## Configuration

### Environment Variables

#### Required
| Variable | Description | Example |
|----------|-------------|---------|
| `DISCORD_TOKEN` | Bot authentication token | `MTE2Nz...` |
| `DISCORD_CHANNEL_ID` | Channel for notifications | `1234567890` |
| `CLIENT_ID` | Discord application client ID | `1167...` |

#### Optional
| Variable | Description | Default |
|----------|-------------|---------|
| `GUILD_ID` | Guild ID for faster command updates | None (global commands) |
| `DISPLAY_TIMEZONE` | User's display timezone | `America/Chicago` (CT) |
| `FAKE_DATE` | Override system time (testing) | None |
| `RESCRAPE` | Force scrape on startup | `0` |

#### Supported Timezones
- `America/New_York` - Eastern Time (ET)
- `America/Chicago` - Central Time (CT) **[Default]**
- `America/Denver` - Mountain Time (MT)
- `America/Los_Angeles` - Pacific Time (PT)
- `America/Phoenix` - MST
- `America/Anchorage` - AKT
- `Pacific/Honolulu` - HST

### Application Constants

All configurable values centralized in `src/config/constants.ts`:

```typescript
DATES_PER_PAGE = 5                              // Events per embed page
NOTIFICATION_EARLY_WARNING_MINUTES = 30         // First alert timing
NOTIFICATION_FINAL_WARNING_MINUTES = 1          // Final alert timing
POST_EVENT_UPDATE_DELAY_MS = 90000              // Update delay (90s)
DAILY_SCRAPE_SCHEDULE = '0 3 * * *'            // Cron schedule
CALENDAR_CACHE_MAX_AGE_MS = 3600000             // 1 hour cache TTL
CALENDAR_CACHE_MAX_SIZE = 100                   // Max cached messages
```

---

## Development Workflow

### Code Quality Standards

This project follows strict TypeScript and Discord.js best practices defined in `.ai/rules/`:

**Type Safety:**
- No `any` types - All functions fully typed
- Strict null checks - Proper type guards
- No type casting - Use type narrowing

**Code Style:**
- 2-space indentation
- Single quotes
- Comments explain WHY, not WHAT
- Functions < 50 lines

**Discord.js Patterns:**
- Always defer long operations (>3s)
- Handle all interaction states (deferred/replied)
- Use ephemeral messages for errors
- Proper button pagination with state management

### Before Committing

```bash
npm run build         # Verify TypeScript compiles (0 errors required)
npm test              # Run all tests (must pass)
npm run test:coverage # Check test coverage
```

### Testing New Features

```bash
# 1. Generate test data
npm run test:generate-data

# 2. View the data
npm run test:view-data

# 3. Start bot and test manually
npm run start

# 4. Test in Discord
/calendar
```

---

## Testing

### Automated Tests (34 Total)

**Unit Tests (25):**
- Date parsing & year rollover logic
- Beat/miss prediction algorithms
- Event grouping & filtering
- Pagination chunking
- Cache cleanup utilities

**Integration Tests (9):**
- Test data generation validation
- Storage read/write operations
- Event format compliance (MarketWatch format)
- Data persistence & overwrites

```bash
npm test                    # Run all tests (~3s)
npm run test:watch          # Watch mode
npm run test:integration    # Integration only
npm run test:coverage       # With coverage report
```

### Live Flow Testing (Time-Based)

Test real-world time-dependent flows using `FAKE_DATE` manipulation:

#### 1. **Validate Live Scraper**
```bash
npm run test:live-scrape
```
- Scrapes MarketWatch NOW
- Validates 89+ events
- Checks format compliance
- Detects structure changes

#### 2. **Trigger Cron Job (in 60 seconds)**
```bash
npm run test:trigger-cron
# Provides FAKE_DATE command
# Cron fires at 3:00 AM (fake time)
# Watch scraper execute and data update
```

#### 3. **Trigger Notifications (in 1 minute)**
```bash
npm run test:trigger-notif
# Generates events +31 minutes from now
# 30-min alert fires in 60 seconds
# Test full notification cycle
```

#### 4. **Full E2E Health Check**
```bash
npm run test:full-flow
# Scrape → Store → Validate → Preview → Timeline
# Complete system verification
```

**See [`.ai/TESTING_FLOWS.md`](.ai/TESTING_FLOWS.md) for detailed workflows.**

### Test Data Generator

Create synthetic data for testing without hitting MarketWatch:

```bash
npm run test:generate-data                # 14 days future events
npm run test:generate-data past           # Past events with actuals
npm run test:generate-data rollover       # Year boundary testing
npm run test:generate-data mixed          # Combined scenarios
npm run test:view-data                    # View stored data
```

**See [`TEST_ENVIRONMENT.md`](TEST_ENVIRONMENT.md) for complete guide.**

---

## Deployment

### Pre-Deployment Checklist

- [ ] All tests passing (`npm test`)
- [ ] Build successful (`npm run build`)
- [ ] Environment variables configured
- [ ] Live scraper validated (`npm run test:live-scrape`)
- [ ] Full flow test passed (`npm run test:full-flow`)
- [ ] Discord bot permissions verified
- [ ] Channel ID correct

### Production Deployment

```bash
# 1. Final validation
npm run test:full-flow

# 2. Build for production
npm run build

# 3. Start with process manager (pm2, systemd, etc.)
npm run start

# Or with pm2:
pm2 start npm --name "tariffs-bot" -- start
pm2 save
```

### Health Monitoring

```bash
# Weekly scraper validation
npm run test:live-scrape

# Check stored data
npm run test:view-data

# Verify logs for errors
tail -f logs/app.log  # If logging to file
```

---

## Advanced Features

### Timezone Display

Configure your local timezone for user-friendly time display:

```bash
# .env
DISPLAY_TIMEZONE=America/Chicago
```

**Display format:**
- Same timezone: `8:30 am ET`
- Different timezone: `8:30 am ET (7:30 am CT)`

**Supported:** All IANA timezone identifiers (America/New_York, America/Chicago, etc.)

### FAKE_DATE Testing

Override system time for testing date-dependent features:

```bash
# Test as if it's March 17, 2025 at 2:28 AM EST
FAKE_DATE=2025-03-17T07:28:58.000Z npm run start

# Test year rollover (December 31st)
FAKE_DATE=2025-12-31T12:00:00.000Z npm run start
```

**Use cases:**
- Test year rollover logic (Dec → Jan)
- Trigger cron jobs on-demand
- Trigger notifications immediately
- Test date parsing edge cases

### Manual Re-scrape

Force data update on bot startup:

```bash
RESCRAPE=1 npm run start
```

**When to use:**
- After MarketWatch publishes new data
- Debugging stale data issues
- Initial bot deployment

---

## Troubleshooting

### Bot Not Responding

**Check:**
1. `DISCORD_TOKEN` is valid and not expired
2. Bot has permissions in the server (Send Messages, Use Slash Commands)
3. Commands were deployed (`npm run start` runs deploy-commands.js)
4. Channel ID is correct

**Verify:**
```bash
npm run test:full-flow  # Tests bot can connect and function
```

### Scraper Failures

**Symptoms:** No events in `/calendar`, logs show scrape errors

**Solutions:**
```bash
# 1. Validate scraper
npm run test:live-scrape

# 2. Check MarketWatch is accessible
curl -I https://www.marketwatch.com/economy-politics/calendar

# 3. Check error logs for HTML structure changes
```

**Common causes:**
- MarketWatch changed HTML structure (update selectors in `scraper.ts`)
- Network connectivity issues
- Rate limiting (user-agent rotation should prevent this)

### Notification Issues

**Symptoms:** Alerts not sending, wrong timing

**Debug:**
```bash
# 1. Test notification trigger
npm run test:trigger-notif

# 2. Check Discord channel permissions
# 3. Verify DISCORD_CHANNEL_ID is correct
# 4. Check logs for timeout scheduling errors
```

### TypeScript Errors

```bash
npm run build  # Shows all compilation errors

# Common fixes:
# - Update @types packages
# - Check tsconfig.json settings
# - Verify all imports are typed
```

### Test Failures

```bash
npm test -- --verbose  # Detailed test output

# If integration tests fail:
rm -rf data/events.json
npm run test:generate-data
npm test
```

---

## Code Quality

### Built-in Safeguards

- **Type Safety:** Strict TypeScript, no `any` types
- **Error Recovery:** Retry logic with exponential backoff
- **Memory Management:** Automatic cache cleanup (hourly)
- **Graceful Shutdown:** Clean up on SIGTERM/SIGINT
- **Input Validation:** All scraped data validated
- **Null Safety:** Proper type guards, no `!` assertions

### Testing Philosophy

**We Test:**
- Pure functions (date math, formatting, calculations)
- Business logic (beat/miss, filtering, grouping)
- Data contracts (event structure, storage format)
- Critical paths (scraper, storage, display)

**We Script (Manual Validation):**
- Discord interactions (slash commands, buttons)
- Real scraping (MarketWatch HTML parsing)
- Notification timing (30m → 1m → update flow)
- Time-dependent flows (cron jobs, FAKE_DATE)

### Documentation

- **Code Standards:** `.ai/rules/` - Style, workflow, Discord.js patterns
- **Testing Guide:** `.ai/TESTING_FLOWS.md` - Complete testing documentation
- **User Guide:** `TEST_ENVIRONMENT.md` - Testing commands & workflows
- **Session Guide:** `claude.md` - Claude AI configuration

---

## Contributing

### Development Setup

```bash
# 1. Fork and clone
git clone https://github.com/yourusername/with-tariffs-wide-open.git
cd with-tariffs-wide-open

# 2. Install dependencies
npm install

# 3. Create .env with your test Discord credentials
cp .env.example .env  # (create this file with your tokens)

# 4. Generate test data
npm run test:generate-data

# 5. Start development
npm run build
npm run start
```

### Adding Features

1. Follow code standards in `.ai/rules/`
2. Write tests for new functionality
3. Update documentation
4. Build and verify (`npm run build`)
5. Run all tests (`npm test`)
6. Test manually with generated data
7. Create PR with clear description

### Running Tests

```bash
# Before committing
npm run build && npm test

# Before deploying
npm run test:full-flow
npm run test:live-scrape
```

---

## Version History

### v2.0 (Current - V2 Improvements)
- Complete testing infrastructure (Jest + 34 tests)
- Live flow testing scripts (FAKE_DATE-powered)
- Timezone display support (ET → local timezone)
- Critical bug fixes (year rollover, null handling, negative numbers)
- Memory management (cache cleanup, graceful shutdown)
- Error recovery (retry logic, resilient scheduler)
- Comprehensive documentation (.ai/rules + testing guides)

### v1.1 (Previous)
- Extended notification system with post-event updates
- Implemented FAKE_DATE for testing
- Added rescrape fallback mechanism
- Optimized and modularized codebase

### v1.0 (Initial)
- Basic calendar display
- Daily scraping
- Simple notifications

---

## Performance

- **Scraper:** ~250ms average response time
- **Storage:** < 10ms read/write operations
- **Tests:** ~3s for complete test suite
- **Memory:** Automatic cleanup prevents unbounded growth
- **Build:** ~2s TypeScript compilation

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

## Credits

Built by [@xConde](https://github.com/xConde)

Powered by:
- discord.js for Discord API integration
- cheerio for HTML parsing
- date-fns for robust date handling

---

## Support

For issues or questions:
- [Open an issue](https://github.com/xConde/with-tariffs-wide-open/issues)
- Read [`.ai/TESTING_FLOWS.md`](.ai/TESTING_FLOWS.md) for testing help
- Check [`TEST_ENVIRONMENT.md`](TEST_ENVIRONMENT.md) for environment setup

---

**Current Status:** Production-ready with comprehensive testing
