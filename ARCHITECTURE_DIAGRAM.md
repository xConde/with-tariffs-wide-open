# Complete Architecture Diagram

## Full System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL SYSTEMS                                        │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐     │
│  │   MarketWatch    │        │   Discord API    │        │   User/Admin     │     │
│  │  (Data Source)   │        │  (WebSocket +    │        │   (Commands)     │     │
│  │                  │        │   REST API)      │        │                  │     │
│  └────────┬─────────┘        └────────┬─────────┘        └────────┬─────────┘     │
│           │                           │                            │                │
└───────────┼───────────────────────────┼────────────────────────────┼────────────────┘
            │                           │                            │
            │ HTTPS/15s timeout         │ WebSocket                  │ /calendar
            │ Retry 3x                  │ Auto-reconnect 5x          │ Button clicks
            │                           │                            │
┌───────────▼───────────────────────────▼────────────────────────────▼────────────────┐
│                           CORE INFRASTRUCTURE                                        │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────┐      │
│  │  Discord Client (src/core/discordClient.ts)                              │      │
│  │  • Single source of truth for client instance                            │      │
│  │  • Prevents circular dependencies                                        │      │
│  │  • Used by: discordBot, alerting, shutdown, channelValidation           │      │
│  └──────────────────────────────────────────────────────────────────────────┘      │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────┐      │
│  │  Configuration (src/config/constants.ts)                                 │      │
│  │  • All application constants centralized                                 │      │
│  │  • Timeouts, retries, schedules, colors                                  │      │
│  │  • Zero dependencies - leaf module                                       │      │
│  └──────────────────────────────────────────────────────────────────────────┘      │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────────────┐
│                            DATA LAYER                                                │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                       │
│  ┌────────────────────┐                                                              │
│  │   Scraper          │  Purpose: Fetch economic events from MarketWatch            │
│  │  (scraper.ts)      │  ────────────────────────────────────────────               │
│  │                    │  • 15s timeout prevents hanging                              │
│  │  67 lines          │  • 4 CSS selector fallbacks (adapt to HTML changes)         │
│  │  6 tests           │  • User-agent rotation (3 agents)                            │
│  │                    │  • Structured error handling (timeout/HTTP/network)          │
│  └─────────┬──────────┘                                                              │
│            │                                                                          │
│            │ CalendarEvent[]                                                          │
│            ↓                                                                          │
│  ┌────────────────────┐                                                              │
│  │   Storage          │  Purpose: Persist events to local JSON                      │
│  │  (storage.ts)      │  ────────────────────────────────────────                   │
│  │                    │  • Atomic writes to data/events.json                         │
│  │  32 lines          │  • Graceful error handling (returns [] on ENOENT)            │
│  │  3 tests           │  • Data validation before save (Priority 6)                  │
│  │                    │  • No corruption on partial writes                            │
│  └─────────┬──────────┘                                                              │
│            │                                                                          │
│            │ Persisted Events                                                        │
│            ↓                                                                          │
│  ┌────────────────────────────────────────────────────────────────────────┐         │
│  │  Data Validation (utils/dataValidation.ts)                             │         │
│  │  • Validates event structure (date, time, title formats)               │         │
│  │  • Minimum threshold: 5 events (prevents saving empty scrapes)         │         │
│  │  • Prevents corrupt data from overwriting good data                    │         │
│  │  109 lines, 11 tests                                                   │         │
│  └────────────────────────────────────────────────────────────────────────┘         │
│                                                                                       │
└───────────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────────────┐
│                         BUSINESS LOGIC LAYER                                          │
├───────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐          │
│  │  Scheduler (scheduler.ts)                                              │          │
│  │  ────────────────────────────────────────────────────────────────────  │          │
│  │  Cron: 0 3 * * * (3 AM EST daily)                                     │          │
│  │                                                                         │          │
│  │  Flow:                                                                  │          │
│  │  [3:00 AM] Cron triggers                                               │          │
│  │     ↓ Call scraper (timeout 15s)                                       │          │
│  │     ↓ Validate data (min 5 events, correct format)                     │          │
│  │     ↓ Save to storage                                                  │          │
│  │     ↓ Refresh notifications                                            │          │
│  │     ↓ On failure: Retry (3x, 1min delay)                               │          │
│  │     ↓ All retries fail: Alert admin via DM                             │          │
│  │                                                                         │          │
│  │  51 lines, explicit startup (startScheduler())                         │          │
│  └────────────────────────────────────────────────────────────────────────┘          │
│                                                                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐          │
│  │  Notifier (notifier.ts)                                                │          │
│  │  ────────────────────────────────────────────────────────────────────  │          │
│  │  Purpose: Schedule and send event notifications                        │          │
│  │                                                                         │          │
│  │  Timeline per event:                                                    │          │
│  │  [Event - 30min] Send yellow alert (forecast/previous)                │          │
│  │  [Event - 1min]  Send orange alert (forecast/previous)                │          │
│  │  [Event + 90s]   Scrape MarketWatch, update with actuals (green/red)  │          │
│  │                                                                         │          │
│  │  Features:                                                              │          │
│  │  • Groups events by time (8:30am events together)                      │          │
│  │  • Filters past events                                                  │          │
│  │  • Persists schedule to disk (survives restarts - Priority 4)          │          │
│  │  • Beat/miss prediction (actual vs forecast)                           │          │
│  │                                                                         │          │
│  │  168 lines, 9 tests                                                     │          │
│  └────────────────────────────────────────────────────────────────────────┘          │
│                                                                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐          │
│  │  Calendar Command (commands/calendar.ts)                               │          │
│  │  ────────────────────────────────────────────────────────────────────  │          │
│  │  Slash command: /calendar                                              │          │
│  │                                                                         │          │
│  │  Flow:                                                                  │          │
│  │  User types /calendar                                                   │          │
│  │     ↓ Load from storage (or scrape if empty)                           │          │
│  │     ↓ Filter past events                                               │          │
│  │     ↓ Group by date                                                    │          │
│  │     ↓ Build paginated embeds (5 dates per page)                        │          │
│  │     ↓ Send with Previous/Next buttons                                  │          │
│  │     ↓ Cache pagination state (message ID → pages)                      │          │
│  │     ↓ User clicks buttons → Update embed                               │          │
│  │                                                                         │          │
│  │  Features:                                                              │          │
│  │  • Timezone-aware display ("8:30 am ET (7:30 am CT)")                 │          │
│  │  • Year rollover handling (Dec → Jan)                                  │          │
│  │  • Event detail formatting (Actual/Forecast/Previous)                  │          │
│  │                                                                         │          │
│  │  183 lines, 16 tests                                                    │          │
│  └────────────────────────────────────────────────────────────────────────┘          │
│                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────────┐
│                            DISCORD INTEGRATION LAYER                                   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  ┌──────────────────────────────────────────────────────────────────────────┐         │
│  │  Discord Bot (discordBot.ts)                                             │         │
│  │  ──────────────────────────────────────────────────────────────────────  │         │
│  │  • Manages Discord client lifecycle                                      │         │
│  │  • Routes commands (/calendar → calendarCommand.execute)                │         │
│  │  • Handles button interactions (prev/next pagination)                    │         │
│  │  • Auto-reconnect on disconnect (5 attempts, exponential backoff)        │         │
│  │  • Fallback channel support (primary fails → fallback)                  │         │
│  │  • Shard event handling (error, disconnect, resume)                     │         │
│  │                                                                           │         │
│  │  130 lines, 10 tests                                                     │         │
│  └──────────────────────────────────────────────────────────────────────────┘         │
│                                                                                         │
│  ┌──────────────────────────────────────────────────────────────────────────┐         │
│  │  Notification Messages (events/notifierMessage.ts)                       │         │
│  │  ──────────────────────────────────────────────────────────────────────  │         │
│  │  • Builds notification embeds (30-min, 1-min, post-event)               │         │
│  │  • Beat/miss prediction (actual vs forecast)                            │         │
│  │  • Color coding: Yellow (30m) → Orange (1m) → Green/Red (result)        │         │
│  │  • Performance indicators: "↑ Higher", "↓ Lower"                        │         │
│  │                                                                           │         │
│  │  86 lines, 9 tests                                                       │         │
│  └──────────────────────────────────────────────────────────────────────────┘         │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              RELIABILITY LAYER                                          │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  ┌──────────────────────────────────────────────────────────────────────────┐          │
│  │  Admin Alerting (utils/alerting.ts)                                      │          │
│  │  • Sends critical failure alerts to admin via DM                         │          │
│  │  • Scraper failures (after 3 retries)                                    │          │
│  │  • Health check failures                                                  │          │
│  │  • Requires ADMIN_USER_ID env var (optional)                             │          │
│  │  60 lines, 8 tests                                                       │          │
│  └──────────────────────────────────────────────────────────────────────────┘          │
│                                                                                          │
│  ┌──────────────────────────────────────────────────────────────────────────┐          │
│  │  Health Monitoring (utils/healthCheck.ts)                                │          │
│  │  • Writes heartbeat.txt every 60 seconds                                 │          │
│  │  • Contains: timestamp, uptime, memory usage                             │          │
│  │  • External monitoring can check file age                                │          │
│  │  • Integrated with graceful shutdown                                     │          │
│  │  74 lines, 7 tests                                                       │          │
│  └──────────────────────────────────────────────────────────────────────────┘          │
│                                                                                          │
│  ┌──────────────────────────────────────────────────────────────────────────┐          │
│  │  Notification Persistence (utils/notificationPersistence.ts)             │          │
│  │  • Saves notification schedule to data/notification-state.json           │          │
│  │  • Restores on bot restart (notifications survive)                       │          │
│  │  • Auto-expires after 24 hours (prevents stale data)                     │          │
│  │  • Clears after successful restoration                                   │          │
│  │  115 lines, 9 tests                                                      │          │
│  └──────────────────────────────────────────────────────────────────────────┘          │
│                                                                                          │
│  ┌──────────────────────────────────────────────────────────────────────────┐          │
│  │  Channel Validation (utils/channelValidation.ts)                         │          │
│  │  • Validates channel accessibility on startup                            │          │
│  │  • Checks permissions: SendMessages, EmbedLinks, ViewChannel            │          │
│  │  • Validates both primary and fallback channels                         │          │
│  │  • Fails fast if misconfigured (prevents silent failures)               │          │
│  │  97 lines, 11 tests                                                      │          │
│  └──────────────────────────────────────────────────────────────────────────┘          │
│                                                                                          │
│  ┌──────────────────────────────────────────────────────────────────────────┐          │
│  │  Graceful Shutdown (utils/shutdown.ts)                                   │          │
│  │  • SIGTERM/SIGINT handlers                                               │          │
│  │  • Cleanup: timeouts, cache, Discord client                              │          │
│  │  • Registered cleanup handlers (heartbeat, cache, etc.)                  │          │
│  │  76 lines                                                                │          │
│  └──────────────────────────────────────────────────────────────────────────┘          │
│                                                                                          │
│  ┌──────────────────────────────────────────────────────────────────────────┐          │
│  │  Cache Cleanup (utils/cacheCleanup.ts)                                   │          │
│  │  • Hourly cleanup of calendar cache (age + size limits)                  │          │
│  │  • Prunes old notification timeouts (>2 hours past event)                │          │
│  │  • Prevents unbounded memory growth                                      │          │
│  │  93 lines, 6 tests                                                       │          │
│  └──────────────────────────────────────────────────────────────────────────┘          │
│                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                           SUPPORT UTILITIES                                              │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                           │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌───────────────────────┐         │
│  │ Timezone Display     │  │ Test Data Generator  │  │ Global Setup          │         │
│  │ (timezoneDisplay.ts) │  │ (testDataGenerator)  │  │ (globalSetup.ts)      │         │
│  │                      │  │                      │  │                       │         │
│  │ • ET → Local TZ      │  │ • Realistic events   │  │ • FAKE_DATE override  │         │
│  │ • Format helpers     │  │ • 4 dataset types    │  │ • Env validation      │         │
│  │ • Abbreviations      │  │ • Time-relative gen  │  │ • RESCRAPE handling   │         │
│  │                      │  │                      │  │                       │         │
│  │ 41 lines             │  │ 253 lines            │  │ 56 lines              │         │
│  └──────────────────────┘  └──────────────────────┘  └───────────────────────┘         │
│                                                                                           │
└───────────────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                            APPLICATION ENTRY POINT                                        │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                            │
│  ┌────────────────────────────────────────────────────────────────────────────┐          │
│  │  Application Startup (index.ts)                                           │          │
│  │  ────────────────────────────────────────────────────────────────────────  │          │
│  │  Explicit initialization sequence:                                        │          │
│  │                                                                            │          │
│  │  1. setupGracefulShutdown()          → Setup SIGTERM/SIGINT handlers     │          │
│  │  2. waitForInitialSetup()            → Wait for RESCRAPE if enabled      │          │
│  │  3. initializeDiscordBot()           → Login to Discord, setup handlers  │          │
│  │  4. validateChannelsOnStartup()      → Check channel access/permissions  │          │
│  │  5. startScheduler()                 → Start 3 AM cron job              │          │
│  │  6. initializeNotifications()        → Schedule upcoming alerts          │          │
│  │  7. schedulePeriodicCleanup()        → Start hourly cache cleanup        │          │
│  │  8. startHeartbeat()                 → Start health monitoring           │          │
│  │                                                                            │          │
│  │  No side effects on import - all explicit! ✅                             │          │
│  │  55 lines                                                                 │          │
│  └────────────────────────────────────────────────────────────────────────────┘          │
│                                                                                            │
└────────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────────────┐
│                              GLOBAL STATE                                                  │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                             │
│  ┌──────────────────────────────────────────────────────────────┐                         │
│  │  globalThis.calendarCache                                    │                         │
│  │  Map<messageId, { pages, currentPage }>                      │                         │
│  │  • Stores pagination state for /calendar embeds              │                         │
│  │  • Cleaned hourly (age + size limits)                        │                         │
│  │  • Max 100 entries, 1 hour TTL                               │                         │
│  └──────────────────────────────────────────────────────────────┘                         │
│                                                                                             │
│  ┌──────────────────────────────────────────────────────────────┐                         │
│  │  globalThis.notificationTimeouts                             │                         │
│  │  Map<eventKey, NodeJS.Timeout[]>                             │                         │
│  │  • Stores scheduled notification timeouts                     │                         │
│  │  • Cleaned when events >2 hours past                         │                         │
│  │  • Cleared on graceful shutdown                              │                         │
│  └──────────────────────────────────────────────────────────────┘                         │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                               PERSISTENT STORAGE                                            │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│  data/events.json                     → Scraped economic events (validated)                │
│  data/notification-state.json         → Scheduled notifications (survives restarts)        │
│  heartbeat.txt                        → Health status (updated every 60s)                  │
│                                                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Module Dependency Graph

```
┌────────────────────────────────────────────────────────────────┐
│                      DEPENDENCY LAYERS                          │
│                   (Bottom → Top / Clean!)                       │
└────────────────────────────────────────────────────────────────┘

Layer 0: Zero Dependencies
├─ config/constants.ts          → No imports, pure config
└─ models/event.ts              → Interface only, no imports

Layer 1: Foundation (depends on Layer 0 only)
├─ core/discordClient.ts        → Creates Discord client
└─ utils/dataValidation.ts      → models/event, pure validation

Layer 2: Core Utils (depends on Layer 0-1)
├─ utils/healthCheck.ts         → fs, path, constants
├─ utils/timezoneDisplay.ts     → date-fns-tz, constants
├─ utils/testDataGenerator.ts   → date-fns, models/event
└─ scraper.ts                   → axios, cheerio, constants, models

Layer 3: Storage & Discord Utils (depends on Layer 0-2)
├─ storage.ts                   → fs, models/event
├─ utils/alerting.ts            → core/discordClient, discord.js
├─ utils/shutdown.ts            → core/discordClient
├─ utils/channelValidation.ts   → core/discordClient, discord.js
└─ utils/notificationPersistence.ts → fs, models/event

Layer 4: Business Logic (depends on Layer 0-3)
├─ commands/calendar.ts         → storage, scraper, timezoneDisplay, constants
├─ events/notifierMessage.ts    → models/event, constants
└─ utils/cacheCleanup.ts        → constants

Layer 5: Orchestration (depends on Layer 0-4)
├─ discordBot.ts                → core/discordClient, commands/calendar, alerting
├─ notifier.ts                  → storage, scraper, discordBot, notifierMessage, notificationPersistence
└─ scheduler.ts                 → scraper, storage, notifier, alerting, dataValidation

Layer 6: Application Entry (depends on all)
├─ globalSetup.ts               → scheduler
└─ index.ts                     → All initialization functions
```

**✅ Clean dependency graph - no circular references!**

---

## Data Flow Sequence Diagrams

### 1. Daily Update Flow (3 AM Cron)

```
Time: 3:00 AM EST
│
├─ [Scheduler] Cron triggers updateCalendarEvents()
│  │
│  ├─ [Scraper] GET https://marketwatch.com/economy-politics/calendar
│  │  │  Timeout: 15s
│  │  │  Selectors: Try 4 fallbacks
│  │  │  Result: CalendarEvent[] (89 events)
│  │  │
│  │  ├─ [DataValidation] shouldAcceptScrapedData()
│  │  │  │  Check: Min 5 events, valid formats, has data
│  │  │  │  Result: Valid ✅
│  │  │  │
│  │  │  ├─ [Storage] saveEvents()
│  │  │  │  │  Write: data/events.json (atomic)
│  │  │  │  │  Result: Saved ✅
│  │  │  │  │
│  │  │  │  ├─ [Notifier] refreshNotifications()
│  │  │  │  │  │
│  │  │  │  │  ├─ Clear old timeouts
│  │  │  │  │  │
│  │  │  │  │  ├─ Parse event times (EST)
│  │  │  │  │  │
│  │  │  │  │  ├─ Group by minute (8:30am events together)
│  │  │  │  │  │
│  │  │  │  │  ├─ Schedule 30-min alerts (setTimeout)
│  │  │  │  │  │
│  │  │  │  │  ├─ Schedule 1-min alerts (setTimeout)
│  │  │  │  │  │
│  │  │  │  │  ├─ Persist to notification-state.json
│  │  │  │  │  │
│  │  │  │  │  └─ Log: "Events updated (89 events)"
│  │  │  │  │
│  │  │  │  └─ [Success]
│  │  │  │
│  │  │  └─ [Failure Path]
│  │  │     │
│  │  │     ├─ Validation fails OR scraper error
│  │  │     ├─ Retry (3 attempts, 1min delay)
│  │  │     ├─ All fail → Alert admin via DM
│  │  │     └─ Keep serving old data
│  │  │
│  │  └─ [Complete]
│  │
│  └─ Next trigger: Tomorrow 3 AM
```

### 2. User Command Flow (/calendar)

```
User types: /calendar
│
├─ [Discord API] Sends interaction to bot
│  │
│  ├─ [DiscordBot] interactionCreate event
│  │  │  Check: Is command? commandName === 'calendar'?
│  │  │
│  │  ├─ [CalendarCommand] execute()
│  │  │  │
│  │  │  ├─ [Storage] getStoredEvents()
│  │  │  │  │  Read: data/events.json
│  │  │  │  │  Result: CalendarEvent[] or []
│  │  │  │  │
│  │  │  │  ├─ Empty? → [Scraper] Scrape MarketWatch (defer reply first)
│  │  │  │  │
│  │  │  │  ├─ Filter past events (isDateOld)
│  │  │  │  │
│  │  │  │  ├─ Group by date (Map<date, events[]>)
│  │  │  │  │
│  │  │  │  ├─ Format event times (timezone conversion if needed)
│  │  │  │  │  "8:30 am" → "8:30 am ET (7:30 am CT)"
│  │  │  │  │
│  │  │  │  ├─ Build date blocks (markdown formatting)
│  │  │  │  │
│  │  │  │  ├─ Chunk into pages (5 dates per page)
│  │  │  │  │
│  │  │  │  ├─ Build embed (title, footer, fields)
│  │  │  │  │
│  │  │  │  ├─ Create buttons (Previous/Next, disabled at boundaries)
│  │  │  │  │
│  │  │  │  ├─ Send to Discord (reply or editReply)
│  │  │  │  │
│  │  │  │  ├─ Cache pagination state
│  │  │  │  │  globalThis.calendarCache.set(messageId, { pages, currentPage })
│  │  │  │  │
│  │  │  │  └─ [User sees embed with buttons]
│  │  │  │
│  │  │  └─ User clicks button:
│  │  │     │
│  │  │     ├─ [DiscordBot] buttonInteraction event
│  │  │     ├─ Retrieve cache, update page
│  │  │     ├─ Build new embed
│  │  │     ├─ Update message
│  │  │     └─ Save new page to cache
│  │  │
│  │  └─ [Complete]
│  │
│  └─ [Fallback if error]
│     ├─ Try primary channel
│     ├─ Primary fails → Try fallback channel
│     ├─ Both fail → Return null
│     └─ User sees error message (if repliable)
```

### 3. Notification Lifecycle

```
Event: "CPI at 8:30 AM" scraped
│
├─ [Notifier] scheduleNotifications()
│  │
│  ├─ Parse event time: "OCT. 7" + "8:30 am" → Date object (EST)
│  │
│  ├─ Calculate notification times:
│  │  │  30-min alert: 8:00 AM
│  │  │  1-min alert:  8:29 AM
│  │  │
│  │  ├─ Schedule 30-min timeout
│  │  │  │  Delay: difference(8:00 AM, now)
│  │  │  │  Callback:
│  │  │  │    ├─ Build yellow embed (forecast/previous)
│  │  │  │    └─ Send to Discord
│  │  │  │
│  │  │  └─ Store timeout ID in globalThis.notificationTimeouts
│  │  │
│  │  ├─ Schedule 1-min timeout
│  │  │  │  Delay: difference(8:29 AM, now)
│  │  │  │  Callback:
│  │  │  │    ├─ Build orange embed (forecast/previous)
│  │  │  │    ├─ Send to Discord → Save message reference
│  │  │  │    │
│  │  │  │    └─ Schedule post-event update (+90 seconds)
│  │  │  │       │  Callback (at 8:31:30 AM):
│  │  │  │       │    ├─ Scrape MarketWatch (get fresh actuals)
│  │  │  │       │    ├─ Find matching event by time
│  │  │  │       │    ├─ Predict beat/miss (actual vs forecast)
│  │  │  │       │    ├─ Build green/red embed with indicator
│  │  │  │       │    └─ Edit previous message (1-min alert)
│  │  │  │       │
│  │  │  │       └─ Store timeout ID
│  │  │  │
│  │  │  └─ Store timeout ID
│  │  │
│  │  └─ Save notification schedule to disk
│  │     │  File: data/notification-state.json
│  │     │  Purpose: Restore if bot restarts
│  │     │
│  │     └─ [Notifications scheduled]
│  │
│  └─ Repeat for all events
│
└─ [Timeline]
   [8:00 AM] User receives yellow 30-min alert 🟡
   [8:29 AM] User receives orange 1-min alert 🟠
   [8:30 AM] Event occurs
   [8:31:30] User sees updated message with actuals 🟢/🔴
```

### 4. Error Recovery Flow

```
Scraper fails (timeout/network/HTTP error)
│
├─ [Scheduler] Catches error
│  │
│  ├─ Attempt 1 failed
│  │  ├─ Log error with context
│  │  ├─ Wait 60 seconds
│  │  └─ Retry
│  │
│  ├─ Attempt 2 failed
│  │  ├─ Log error
│  │  ├─ Wait 60 seconds
│  │  └─ Retry
│  │
│  ├─ Attempt 3 failed
│  │  │
│  │  ├─ Log: "Failed after 3 attempts"
│  │  │
│  │  ├─ [Alerting] sendScraperFailureAlert()
│  │  │  │
│  │  │  ├─ Build red error embed
│  │  │  │  Title: "⚠️ Bot Alert"
│  │  │  │  Description: "Scraper failed after 3 attempts"
│  │  │  │  Details: Error message
│  │  │  │
│  │  │  ├─ Fetch admin user (ADMIN_USER_ID)
│  │  │  │
│  │  │  ├─ Send DM to admin
│  │  │  │
│  │  │  └─ Log: "Admin alert sent"
│  │  │
│  │  └─ Keep serving old data (better than nothing)
│  │
│  └─ [Next day: Retry normally]
```

### 5. Bot Restart Flow

```
Bot crashes or restarts
│
├─ [Shutdown] Graceful cleanup
│  ├─ Clear notification timeouts
│  ├─ Clear calendar cache
│  ├─ Close Discord client
│  └─ Stop heartbeat
│
├─ [Bot restarts]
│  │
│  ├─ [Index] startApp()
│  │  │
│  │  ├─ setupGracefulShutdown() ✅
│  │  │
│  │  ├─ waitForInitialSetup() ✅
│  │  │
│  │  ├─ initializeDiscordBot() ✅
│  │  │
│  │  ├─ validateChannelsOnStartup() ✅
│  │  │
│  │  ├─ startScheduler() ✅
│  │  │
│  │  ├─ initializeNotifications()
│  │  │  │
│  │  │  ├─ [Storage] getStoredEvents()
│  │  │  │  Empty? Check persisted state
│  │  │  │
│  │  │  ├─ [NotificationPersistence] getEventsNeedingNotifications()
│  │  │  │  │  Read: data/notification-state.json
│  │  │  │  │  Filter: Only future events
│  │  │  │  │  Result: Events that need alerts
│  │  │  │  │
│  │  │  │  ├─ Found events? Restore notifications ✅
│  │  │  │  │  Log: "Restoring X events from persisted state"
│  │  │  │  │
│  │  │  │  └─ clearNotificationState()
│  │  │  │
│  │  │  └─ Notifications restored! ✅
│  │  │
│  │  ├─ schedulePeriodicCleanup() ✅
│  │  │
│  │  └─ startHeartbeat() ✅
│  │
│  └─ [Bot operational again]
│     All notifications preserved! ✅
```

---

## Testing Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    TESTING PYRAMID                              │
└────────────────────────────────────────────────────────────────┘

            ┌─────────────────┐
            │  Manual Tests   │  ← Visual verification
            │  • Discord UI   │
            │  • /calendar    │
            │  • Notifications│
            └─────────────────┘
          ┌───────────────────────┐
          │   Flow Scripts        │  ← Time-based validation
          │   • test:live-scrape  │
          │   • test:trigger-cron │
          │   • test:trigger-notif│
          │   • test:full-flow    │
          └───────────────────────┘
      ┌─────────────────────────────────┐
      │  Integration Tests (9)          │  ← Data pipeline
      │  • Data generation              │
      │  • Storage operations           │
      │  • Format validation            │
      └─────────────────────────────────┘
  ┌───────────────────────────────────────────┐
  │  Unit Tests (97)                          │  ← Pure functions
  │  • Date parsing (16)                      │
  │  • Beat/miss (9)                          │
  │  • Scraper (14)                           │
  │  • Discord (10)                           │
  │  • Utils (48)                             │
  └───────────────────────────────────────────┘

Total: 106 automated tests + 4 flow scripts
Execution: ~7 seconds for all tests
```

---

## Reliability Features Map

```
┌────────────────────────────────────────────────────────────────┐
│           FAILURE PREVENTION & RECOVERY                         │
└────────────────────────────────────────────────────────────────┘

Scraper Layer:
├─ Timeout (15s)                    → Prevents hanging
├─ Retry (3x, 1min delay)           → Handles transient failures
├─ Selector fallbacks (4)           → Adapts to HTML changes
├─ Data validation                  → Prevents corrupt data
└─ Error categorization              → Timeout vs HTTP vs Network

Notification Layer:
├─ Persistence to disk              → Survives restarts
├─ Past event filtering             → Only schedules future
├─ Null-safe parsing                → Gracefully skips bad data
├─ Cleanup (hourly)                 → Prevents memory leaks
└─ Post-event scraping               → Gets actual values

Discord Layer:
├─ Reconnect (5 attempts)           → Auto-recovery from disconnect
├─ Exponential backoff              → Prevents API hammering
├─ Fallback channel                 → Degrades gracefully
├─ Permission validation            → Fails fast on startup
└─ Error boundaries                  → Isolated failures

Monitoring Layer:
├─ Heartbeat (60s)                  → Liveness check
├─ Admin alerts                     → Know when failures occur
├─ Health check API                 → External monitoring
└─ Structured logging                → Debug support
```

---

## File Organization Summary

```
with-tariffs-wide-open/
├── src/
│   ├── core/          → 1 file  (Discord client - shared infrastructure)
│   ├── config/        → 1 file  (All constants - 45+ constants)
│   ├── models/        → 1 file  (Event interface)
│   ├── commands/      → 1 file  (Calendar command - 183 lines)
│   ├── events/        → 1 file  (Notification embeds - 86 lines)
│   ├── utils/         → 9 files (Support utilities - avg 89 lines each)
│   ├── scripts/       → 6 files (Testing/dev tools)
│   └── *.ts           → 5 files (Main app modules)
│
├── tests/
│   ├── commands/      → 1 file  (16 tests)
│   ├── events/        → 1 file  (9 tests)
│   ├── utils/         → 8 files (70 tests)
│   ├── integration/   → 1 file  (9 tests)
│   └── *.test.ts      → 3 files (12 tests)
│
├── .ai/
│   ├── rules/         → 3 files (Code standards)
│   ├── TESTING_FLOWS.md
│   ├── CODE_REVIEW.md
│   └── ARCHITECTURE.md (this file)
│
└── Documentation
    ├── README.md              (774 lines - complete guide)
    ├── TEST_ENVIRONMENT.md    (325 lines - testing guide)
    ├── ARCHITECTURE.md        (Living architecture doc)
    └── claude.md              (Session configuration)
```

**Total:**
- Source: 27 files, 2,433 lines
- Tests: 12 files, 106 tests
- Docs: 7 files, 2,500+ lines

---

**Diagram Version:** 1.0
**Last Updated:** 2025-10-06 (after all 8 reliability priorities + architectural fixes)
**Status:** Production-ready architecture
