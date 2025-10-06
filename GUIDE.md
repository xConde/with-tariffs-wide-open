# Developer Guide

> Complete reference for the Discord Economic Calendar Bot

## Getting Started

### Installation
```bash
git clone https://github.com/xConde/with-tariffs-wide-open.git
cd with-tariffs-wide-open
npm install
```

### Configuration
Create `.env` with required credentials:
```bash
DISCORD_TOKEN=your_bot_token
DISCORD_CHANNEL_ID=your_channel_id
CLIENT_ID=your_client_id
```

Optional settings:
```bash
DISPLAY_TIMEZONE=America/Chicago    # Your timezone
ADMIN_USER_ID=your_user_id          # Receives failure alerts
FALLBACK_CHANNEL_ID=backup_channel  # Backup notifications
```

### Start Bot
```bash
npm run build
npm run start
```

---

## Architecture

### System Flow
```
MarketWatch → Scraper (15s timeout, 4 selectors)
           → Storage (validate, save)
           → Scheduler (3 AM daily, 3 retries)
           → Notifier (30m/1m alerts, persistence)
           → Discord (reconnect, fallback channel)
```

### Core Modules

| Module | Purpose | Key Features |
|--------|---------|--------------|
| **scraper** | Fetch MarketWatch data | Timeout, selector fallbacks, retry |
| **storage** | Persist events (JSON) | Validation, atomic writes |
| **scheduler** | Daily 3 AM updates | Retry logic, admin alerts |
| **notifier** | Send alerts | 30m/1m/post-event, persistence |
| **commands/calendar** | `/calendar` command | Pagination, timezone display |
| **discordBot** | Discord integration | Auto-reconnect, fallback channel |

### Directory Structure
```
src/
├── core/              # Shared (discordClient)
├── config/            # Constants (45+ values)
├── services/          # Scrapers (extensible)
│   └── scrapers/
│       ├── ICalendarScraper.ts
│       └── marketwatchScraper.ts
├── commands/          # Slash commands
├── utils/             # 9 utility modules
└── Main modules (scraper, storage, scheduler, notifier)
```

---

## Testing

### Quick Test
```bash
npm test                    # 106 tests, ~7s
npm run test:watch          # Watch mode
```

### Live Validation
```bash
npm run test:full-flow      # E2E health check (recommended)
npm run test:live-scrape    # Validate scraper only
```

### Time-Based Testing
Use `FAKE_DATE` to trigger time-dependent features:

```bash
# Trigger cron in 60 seconds
npm run test:trigger-cron
# → Copies FAKE_DATE command to run

# Trigger notifications in 1 minute
npm run test:trigger-notif
# → Copies FAKE_DATE command to run
```

### Test Data
```bash
npm run test:generate-data         # 14 days of events
npm run test:generate-data past    # With actuals (testing)
npm run test:view-data             # View stored data
```

**Types:** `standard` (default), `past`, `rollover`, `mixed`

---

## Development

### Code Standards

**Rules:** `.ai/rules/` (code-style, workflow, discord-bot-patterns)

**Key points:**
- No `any` types (strict TypeScript)
- Functions < 50 lines
- Comments explain WHY not WHAT
- Build before commit (zero errors)

### Adding Features

1. Follow `.ai/rules/` standards
2. Write tests for new logic
3. Update GUIDE.md if user-facing
4. Build: `npm run build`
5. Test: `npm test`
6. Commit with clear message

### Configuration

**All constants:** `src/config/constants.ts`

Common values:
- Timeouts: `SCRAPER_TIMEOUT_MS = 15000`
- Retries: `SCRAPER_MAX_RETRIES = 3`
- Schedule: `DAILY_SCRAPE_SCHEDULE = '0 3 * * *'`
- Display: `DATES_PER_PAGE = 5`

### Extending Scrapers

**Add new data source** (e.g., FRED):

1. Create `src/services/scrapers/fredScraper.ts`:
```typescript
export class FREDScraper implements ICalendarScraper {
  sourceName = 'FRED';
  async scrape(): Promise<CalendarEvent[]> { /* ... */ }
  async isAvailable(): Promise<boolean> { /* ... */ }
}
```

2. Create orchestrator to try multiple sources:
```typescript
const scrapers = [marketwatchScraper, fredScraper];
for (const s of scrapers) {
  if (await s.isAvailable()) return await s.scrape();
}
```

3. Add tests, update scheduler

---

## Deployment

### Pre-Deploy Checklist
```bash
npm test                    # ✅ All tests pass
npm run build               # ✅ Zero errors
npm run test:live-scrape    # ✅ Scraper works
npm run test:full-flow      # ✅ E2E passes
```

### Production Start

**With PM2:**
```bash
pm2 start npm --name "calendar-bot" -- start
pm2 startup && pm2 save
```

**Monitor:**
```bash
pm2 logs calendar-bot
pm2 monit

# External health check (heartbeat.txt age)
find heartbeat.txt -mmin +2  # Stale? Bot down
```

---

## Troubleshooting

### Bot Not Responding
```bash
npm run test:full-flow  # Diagnoses connectivity
```
Check: Token valid, permissions set, commands deployed

### Scraper Fails
```bash
npm run test:live-scrape  # Validates against live MarketWatch
```
Common: HTML changed (4 selector fallbacks should handle), network issue (3 retries), rate limit (user-agent rotation)

### No Notifications
Check: `DISCORD_CHANNEL_ID` correct, bot has permissions, events have valid times

**Debug:**
```bash
npm run test:trigger-notif  # Test notification flow
npm run test:view-data      # Verify events exist
```

### Silent Failures
**Should never happen** - admin gets DM when:
- Scraper fails 3x
- Discord reconnect fails 5x
- Validation rejects data

**If not getting alerts:** Check `ADMIN_USER_ID` configured correctly

---

## Reliability

### Features (All 8 Priorities)

| Feature | Benefit |
|---------|---------|
| **Scraper timeout** (15s) | Never hangs |
| **Admin alerts** (DM) | Know when failures occur |
| **Health heartbeat** (60s) | Monitor uptime externally |
| **Notification persistence** | Survive restarts |
| **Auto-reconnect** (5x) | Recover from disconnects |
| **Data validation** | Prevent corrupt saves |
| **Selector fallbacks** (4) | Adapt to HTML changes |
| **Fallback channel** | Graceful degradation |

### Failure Recovery

**MarketWatch down:**
```
Timeout → Retry 1 (wait 60s) → Retry 2 → Retry 3 → Alert admin → Keep old data
```

**Bot restart:**
```
Shutdown → Restart → Restore notifications from disk → Resume (no alerts lost)
```

**Discord disconnect:**
```
Detect → Wait 5s → Reconnect → Fail? Retry (5x, exponential backoff) → Alert admin
```

---

## Commands Reference

### Core
```bash
npm run build              # Compile TypeScript
npm run start              # Deploy commands + start bot
```

### Testing
```bash
npm test                   # All 106 tests
npm run test:live-scrape   # Scraper validation
npm run test:trigger-cron  # Cron test (60s)
npm run test:trigger-notif # Notification test (1min)
npm run test:full-flow     # Complete E2E
```

### Data Management
```bash
npm run test:generate-data [type]  # Create test data
npm run test:view-data             # View stored events
```

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DISCORD_TOKEN` | ✅ | Bot auth token |
| `DISCORD_CHANNEL_ID` | ✅ | Notification channel |
| `CLIENT_ID` | ✅ | Discord app ID |
| `ADMIN_USER_ID` | - | Failure alert recipient |
| `FALLBACK_CHANNEL_ID` | - | Backup channel |
| `DISPLAY_TIMEZONE` | - | User timezone (default: CT) |
| `FAKE_DATE` | - | Override time (testing) |

**Timezones:** America/New_York, America/Chicago, America/Denver, America/Los_Angeles, etc.

---

## Data Files

- `data/events.json` - Scraped events (validated)
- `data/notification-state.json` - Scheduled notifications (persistence)
- `heartbeat.txt` - Health status (every 60s)

---

## Performance

- Scraper: ~250ms (< 15s max)
- Tests: ~7s (106 tests)
- Build: ~2s
- Memory: ~150MB (with cleanup)

---

## FAQ

**Q: Test without hitting MarketWatch?**
A: `npm run test:generate-data`

**Q: Test cron without waiting until 3 AM?**
A: `npm run test:trigger-cron` (triggers in 60s)

**Q: Notifications lost on restart?**
A: No - restored from notification-state.json

**Q: MarketWatch changes HTML?**
A: 4 selector fallbacks + validation should adapt

**Q: How to monitor bot health?**
A: Check heartbeat.txt age (> 2min = down)

---

## Support

- [Open an issue](https://github.com/xConde/with-tariffs-wide-open/issues)
- Read this guide
- Run `npm run test:full-flow` for diagnostics

---

**Version:** 2.0 | **Status:** Production-ready | **Reliability:** 9.5/10
