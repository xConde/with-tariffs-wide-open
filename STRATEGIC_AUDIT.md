# Strategic Audit - Velocity Sprint

**Date:** 2026-02-06
**Branch:** `feat/velocity-reliability-fixes`
**Auditor:** Claude (Sovereign Lead Engineer)

---

## 1. MOMENTUM & ZOMBIES

### What's Mostly Done

The V2 reliability sprint (Oct 2025) shipped 8/8 priorities and 107 tests.
The codebase is well-structured with clean dependency layers, centralized config,
explicit startup sequencing, and a scraper interface for future extensibility.

**Last meaningful commit:** Oct 6, 2025 (4 months stalled).

### The Zombies

| # | Zombie | File | What's Broken |
|---|--------|------|---------------|
| 1 | **Notification Persistence (CRITICAL)** | `notifier.ts`, `notificationPersistence.ts`, `shutdown.ts` | `saveNotificationState()` exists but is **NEVER CALLED**. The load path works, but nothing ever writes state. On bot restart, all scheduled notifications are lost. The commit message claims "Notifications survive bot restarts" -- this is false. |
| 2 | **Cache Cleanup (Broken)** | `cacheCleanup.ts:21` | All cache entries get `timestamp: now` when cleanup runs, so age-based eviction never triggers. Cache only cleans by size limit. |
| 3 | **Scraper Orchestrator (Documented, Never Built)** | `scraper.ts`, `ICalendarScraper.ts` | Interface defined, `isAvailable()` implemented but never called. The multi-source fallback pattern is documented in GUIDE.md but not implemented. scraper.ts says "deprecated" but is the only import path used. |
| 4 | **sendDiscordAlert() (Dead Code)** | `discordBot.ts:17-22` | Function defined, exported, never called anywhere. Superseded by `sendEmbed()` and `sendAdminAlert()`. |
| 5 | **EST_TIMEZONE (Deprecated, Still Active)** | `constants.ts:18`, `notifier.ts:11,30,135` | Marked deprecated in favor of `SOURCE_TIMEZONE` but still imported and used in 3 places in the notifier. |

### What's Shipping (Working Correctly)

- Scraper with timeout, selector fallbacks, and structured error handling
- Daily cron scheduling with 3-retry logic and admin alerting
- Discord reconnect with exponential backoff
- Channel validation with fallback
- Health check heartbeat
- Data validation before save
- `/calendar` command with pagination
- Notification embeds (30min + 1min + post-event update)

---

## 2. THE GAP

**The single architectural blocker: The notification persistence system is a one-way street.**

The entire "survive restarts" feature is broken at the write layer:

```
CURRENT FLOW (broken):
  Bot starts -> loadNotificationState() -> nothing saved -> returns null -> no restoration
  Events scraped -> notifications scheduled -> NOT SAVED TO DISK
  Bot crashes -> all scheduled notifications lost
  Bot restarts -> loadNotificationState() -> file doesn't exist -> no restoration

INTENDED FLOW (never wired):
  Events scraped -> notifications scheduled -> saveNotificationState() -> disk
  Bot crashes
  Bot restarts -> loadNotificationState() -> finds state -> restores notifications
```

Additionally, the graceful shutdown handler clears all notification timeouts but
never calls `saveNotificationState()` first -- so even a clean restart loses everything.

**Secondary blockers preventing production confidence:**

1. **No concurrency guard on scheduler** -- if cron fires while scraping, two scrapers
   run simultaneously and race to write `events.json`
2. **No atomic writes to storage** -- crash during `writeFile()` corrupts `events.json`,
   and `getStoredEvents()` silently returns `[]` instead of alerting
3. **Cache cleanup never works** -- timestamp bug means entries appear eternally fresh

---

## 3. THE BATTLE PLAN

### Phase A: Fix the #1 Zombie (Notification Persistence)

- [ ] **A1.** In `notifier.ts`: After scheduling all notifications in `scheduleNotifications()`,
      call `saveNotificationState()` with the current groups and timeout map
- [ ] **A2.** In `shutdown.ts`: Before clearing notification timeouts, call
      `saveNotificationState()` to persist state for next startup
- [ ] **A3.** Verify the load -> schedule -> save -> restart -> load cycle works end-to-end

### Phase B: Fix Broken Infrastructure

- [ ] **B1.** Fix `cacheCleanup.ts` -- store actual timestamps when cache entries are created,
      not when cleanup runs
- [ ] **B2.** Add `isRunning` concurrency guard to `scheduler.ts` to prevent overlapping scrape operations
- [ ] **B3.** Add atomic writes to `storage.ts` (write to temp file, then rename)

### Phase C: Clean Dead Code

- [ ] **C1.** Remove `sendDiscordAlert()` from `discordBot.ts` (dead code)
- [ ] **C2.** Replace all `EST_TIMEZONE` usage in `notifier.ts` with `SOURCE_TIMEZONE`
- [ ] **C3.** Remove `EST_TIMEZONE` export from `constants.ts`

### Phase D: Validate

- [ ] **D1.** `npm run build` -- zero TypeScript errors
- [ ] **D2.** `npm test` -- all 107+ tests passing
- [ ] **D3.** Review all changes for correctness

---

**Classification:** Utility product (no revenue/payment code).
Pure infrastructure for a Discord bot serving economic calendar data.

**Velocity Assessment:** 4-month stall since last merge. The V2 sprint was thorough
but left critical zombie code that undermines the reliability story.
This sprint closes every gap.

---

## Red Team Critique

**Reviewer role:** Lead Security & Reliability Engineer, hostile code review.

### Weakness 1 (CRITICAL): `shutdown.ts` dependency explosion

The architect's fix introduced `import { persistCurrentNotifications } from '../notifier'`
directly into `shutdown.ts`. This expanded the shutdown module's transitive dependency
tree from **1 internal module** (`core/discordClient.ts`) to **~18 internal modules + 7
external packages** -- including `axios`, `cheerio`, `node-cron`, the entire scraper,
scheduler, Discord bot, and `globalSetup.ts`.

**Why this is dangerous:**

1. `globalSetup.ts` has **side effects at import time**: it calls `process.exit(1)` if
   env vars are missing. If module resolution triggers this before shutdown handlers
   are registered, the bot exits without signal handlers.

2. The import chain contains a **circular dependency**: `shutdown.ts -> notifier.ts ->
   globalSetup.ts -> scheduler.ts -> notifier.ts`. Node.js resolves this via partial
   module initialization, which works but is fragile and confusing to debug.

3. The V2 refactor **explicitly extracted** `core/discordClient.ts` to keep `shutdown.ts`
   isolated. This change violates that architectural decision.

**The correct pattern already exists**: `registerCleanupHandler()` in `shutdown.ts`.
The notifier should register its own persistence handler from `index.ts` during startup,
not via a direct import in the shutdown module.

### Weakness 2 (HIGH): Save-then-immediately-clear defeats persistence on restore

In `notifier.ts`, the restore path does:
```
await saveNotificationState(groups, timeouts);   // writes state to disk
if (restoredFromPersistence) {
  await clearNotificationState();                 // DELETES the file we just wrote
}
```

Walk through the failure scenario:
1. Bot crashes, restarts
2. Notifications restored from `notification-state.json`
3. `saveNotificationState()` writes updated state -- correct
4. `clearNotificationState()` immediately deletes it
5. Bot crashes AGAIN before next 3 AM cron
6. No persisted state exists -- all notifications lost

The clear call is directly counterproductive. The `saveNotificationState()` call already
overwrites the old file with the current schedule. There is no stale data to clear.

### Weakness 3 (MEDIUM): Shutdown persistence does async file I/O

`persistCurrentNotifications()` calls `getStoredEvents()` (disk read) and
`saveNotificationState()` (disk write) during shutdown. When the shutdown trigger
is `uncaughtException`, the filesystem could be in a bad state. There's no timeout
on this I/O -- if the disk hangs, shutdown hangs indefinitely. The `try/catch` catches
errors but not hangs.

### Fix Plan

**For Weakness 1:** Remove the `notifier.ts` import from `shutdown.ts`. Instead,
register `persistCurrentNotifications` as a cleanup handler from `index.ts`
via the existing `registerCleanupHandler()` API. This keeps shutdown.ts isolated.

**For Weakness 2:** Remove the `clearNotificationState()` call on the restore path.
The save already wrote the correct state.

**For Weakness 3:** Accepted risk. The try/catch is sufficient for the common case.
A hung disk during `uncaughtException` is a scenario where the process is already
in a degraded state. Adding a timeout would add complexity for a marginal edge case.

---

## Sprint 2: Deep Sweep

### 1. MOMENTUM & ZOMBIES (Round 2)

Sprint 1 fixed the persistence wiring, cache cleanup, scheduler concurrency, atomic
writes, and dead code. But the deeper audit revealed a more fundamental problem:
**the notification system's date parser has never worked.**

| # | Finding | Severity | File:Line |
|---|---------|----------|-----------|
| 1 | **Date format mismatch in notifier** -- `parseEventDateTime` uses `'MMMM d'` (expects "October 6") but MarketWatch outputs "OCT. 6". Every parse returns null. Zero notifications have ever scheduled. | CRITICAL | `notifier.ts:43,47` |
| 2 | **Fake tests** -- `scraper.test.ts` and `discordBot.test.ts` test local constants and mock objects, not real code. 16 "tests" catch zero regressions. | CRITICAL | `tests/scraper.test.ts`, `tests/discordBot.test.ts` |
| 3 | **globalSetup.ts process.exit at import time** -- env var validation calls `process.exit(1)` during module load, before shutdown handlers are registered. | HIGH | `globalSetup.ts:49-55` |
| 4 | **calendarCache.set() without null guard** -- pagination handler uses `.set()` without optional chaining. | MEDIUM | `discordBot.ts:101` |
| 5 | **storage.ts silent data loss** -- JSON parse failure returns `[]` with no distinction from empty file. Corrupted data silently vanishes. | MEDIUM | `storage.ts:27-31` |

### 2. THE GAP (Round 2)

**The notification system has never worked.** The date parser is fundamentally incompatible
with the scraper's output format.

MarketWatch uses inconsistent month formatting:
- Abbreviated + period: `JAN.` `FEB.` `MAR.` `APR.` `AUG.` `SEPT.` `OCT.` `NOV.` `DEC.`
- No period: `MAY`
- Full name: `JUNE` `JULY`

The data validation module (`dataValidation.ts:27`) correctly documents this with a regex.
The calendar command (`calendar.ts:75`) uses `'MMM. d'` format.
But the notifier (`notifier.ts:43`) uses `'MMMM d'` -- **a format that matches NONE of them.**

No single date-fns format string handles all MarketWatch month variants. A normalization
layer is required.

### 3. THE BATTLE PLAN (Round 2)

#### Phase E: Fix the Dead Notification System
- [x] **E1.** Add `normalizeMarketWatchMonth()` function to convert all MarketWatch month
      variants to full month names (e.g., "OCT." -> "October", "SEPT." -> "September")
- [x] **E2.** Wire normalization into `parseEventDateTime()` before date-fns `parse()`
- [x] **E3.** Write tests that validate parsing with actual MarketWatch date formats
      (`tests/notifier.test.ts` -- 5 tests covering all 12 months, case insensitivity)

#### Phase F: Replace Fake Tests
- [x] **F1.** Replace `scraper.test.ts` with tests that exercise `MarketWatchScraper`
      methods using mocked HTML (9 real behavioral tests)
- [x] **F2.** Replace `discordBot.test.ts` with tests that validate actual reconnect
      constants from `config/constants.ts` (5 tests importing real constants)

#### Phase G: Fix Remaining Bugs
- [x] **G1.** Move `globalSetup.ts` env validation into exported `validateEnvironment()`,
      called from `index.ts` after shutdown handlers registered. Throws instead of process.exit.
- [x] **G2.** Add optional chaining to `calendarCache.set()` in `discordBot.ts:101`
- [x] **G3.** Distinguish JSON parse errors (SyntaxError -> throw) from file-not-found
      (ENOENT -> return []) in `storage.ts`

#### Phase G+ (Bonus): Fix Discovered Bug
- [x] **G4.** Fix `startHeartbeat()` fire-and-forget race: initial `writeHeartbeat()` was
      async but never awaited, causing flaky health check test. Made function async, updated
      callers in `index.ts` and `healthCheck.test.ts`.

#### Phase H: Validate
- [x] **H1.** `npm run build` -- zero TypeScript errors
- [x] **H2.** `npm test` -- 13 suites, 112 tests passing (was 12 suites, 107 tests)

---

## Red Team Critique (Round 2)

**Reviewer role:** Lead Security & Reliability Engineer, hostile code review of Sprint 2 changes.

### Weakness 1 (CRITICAL): `getStoredEvents()` SyntaxError throw creates a startup crash loop

The architect changed `storage.ts` so JSON parse errors throw instead of returning `[]`.
Walk the call chain:

```
startApp()
  -> initializeNotifications()
    -> scheduleNotifications()
      -> getStoredEvents()          // throws SyntaxError if events.json corrupted
        <- SyntaxError propagates   // scheduleNotifications has NO catch
      <- SyntaxError propagates     // initializeNotifications has NO catch
    <- SyntaxError propagates
  -> catch (error) { process.exit(1) }  // bot DEAD
```

**Before this change:** corrupted `events.json` returned `[]`, bot started with no events,
the 3 AM cron re-scraped and self-healed. Zero human intervention required.

**After this change:** corrupted `events.json` prevents the bot from starting entirely.
An admin must SSH in and manually delete or fix the file. The atomic write pattern in
`saveEvents()` reduces corruption risk, but does NOT eliminate it (disk errors, manual
edits, pre-upgrade crash with old non-atomic write still on disk).

The architect's intent ("make corruption visible, not silent") was correct. The
implementation ("throw from a utility function called on the startup critical path")
is a self-inflicted availability regression.

### Weakness 2 (HIGH): `notificationPersistence.ts` uses non-atomic writes — the same bug Sprint 1 fixed in `storage.ts`

Sprint 1 correctly identified non-atomic `writeFile` in `storage.ts` as a corruption
risk and fixed it with write-to-temp-then-rename. But `notificationPersistence.ts:45`
has the **exact same pattern**:

```typescript
await fs.writeFile(NOTIFICATION_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
```

A crash during this write corrupts `notification-state.json`. On restart,
`loadNotificationState()` calls `JSON.parse(data)` on the corrupted file,
hits the catch block, and returns `null` — silently losing the notification schedule.

The architect fixed this class of bug in one file but failed to apply the same
pattern to the sister persistence file that was touched in the same sprint.

### Weakness 3 (MEDIUM): MarketWatch month format knowledge is duplicated without a shared source of truth

Two files independently encode the complete set of MarketWatch month abbreviations:

1. `notifier.ts` — `MONTH_NORMALIZATION` map (12 entries: `'JAN.': 'January'`, etc.)
2. `dataValidation.ts:27` — regex pattern `(JAN\.|FEB\.|...|DEC\.)`

No test or compile-time check validates they agree. If MarketWatch introduces a format
change:
- Updating `dataValidation.ts` but not `MONTH_NORMALIZATION` → validation passes,
  notifications silently fail (events group to `null` and are skipped)
- Updating `MONTH_NORMALIZATION` but not the regex → valid events rejected as malformed

This is a time bomb. The next developer who touches either file won't know the other
needs updating.

### Fix Plan

**For Weakness 1:** Change `getStoredEvents()` to log at ERROR level for SyntaxError
but return `[]` instead of throwing. This preserves the visibility goal (admins see the
error in logs/monitoring) without creating an availability regression. The bot starts,
the cron self-heals.

**For Weakness 2:** Apply the same atomic write pattern from `storage.ts` to
`notificationPersistence.ts:45` — write to `.tmp`, then `rename()`.

**For Weakness 3:** Accepted risk for now. A shared constants approach would add
coupling between validation and notification for marginal benefit. The test coverage
on `normalizeMarketWatchMonth` documents the 12 formats explicitly.

---

## Deployment Checklist

Final steps to take this branch from "started" to "shippable."

- [ ] **1. Remove dead `clearNotificationState` export** — function in
      `notificationPersistence.ts` is exported but never imported. Superseded by
      `saveNotificationState` which overwrites previous state.
- [ ] **2. Final validation** — `npm run build` + `npm test`, zero errors, 112+ tests.
- [ ] **3. Create PR** — `feat/velocity-reliability-fixes` → `master` with full
      summary of all fixes across both sprints and both Red Team passes.
