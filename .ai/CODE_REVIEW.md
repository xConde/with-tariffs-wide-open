# Code Review - V2 Architecture & Organization

**Review Date:** 2025-10-06
**Scope:** All 8 reliability priorities + existing codebase
**Total Source:** 27 files, 2,433 lines
**Test Coverage:** 106 tests across 12 test files

---

## 🏗️ Architecture Assessment

### **Overall Score: 8.5/10** ⭐⭐⭐⭐⭐⭐⭐⭐✨☆

**Strengths:**
- ✅ Clear separation of concerns (commands, utils, events, config)
- ✅ Proper layering (data → logic → presentation)
- ✅ Consistent error handling patterns
- ✅ Well-documented with tests
- ✅ No circular dependencies detected

**Areas for Improvement:**
- ⚠️ Some coupling between notifier and discordBot
- ⚠️ globalSetup has side effects on import
- ⚠️ Constants not all in constants.ts (some hardcoded in discordBot)

---

## 📊 Dependency Graph

```
┌────────────────────────────────────────────────────────────────┐
│ ENTRY POINT (index.ts)                                         │
└────────────────────────────────────────────────────────────────┘
         │
         ├─→ globalSetup (side effects!)
         ├─→ discordBot
         ├─→ scheduler (side effects!)
         └─→ utils/ (healthCheck, cacheCleanup, shutdown, channelValidation)

┌────────────────────────────────────────────────────────────────┐
│ CORE MODULES (Business Logic)                                  │
└────────────────────────────────────────────────────────────────┘

scraper.ts
  ↓ imports: models/event, config/constants
  ↓ provides: scrapeEconomicCalendar()
  ↓ used by: scheduler, notifier, commands/calendar

storage.ts
  ↓ imports: models/event
  ↓ provides: saveEvents(), getStoredEvents()
  ↓ used by: scheduler, notifier, commands/calendar

scheduler.ts
  ↓ imports: scraper, storage, notifier, alerting, dataValidation
  ↓ provides: updateCalendarEvents()
  ↓ side effect: cron.schedule() on import
  ↓ used by: globalSetup, index (via import)

notifier.ts
  ↓ imports: storage, scraper, discordBot, events/notifierMessage, notificationPersistence
  ↓ provides: scheduleNotifications(), refreshNotifications()
  ↓ side effect: scheduleNotifications() on import
  ↓ used by: scheduler

commands/calendar.ts
  ↓ imports: storage, scraper, timezoneDisplay, config/constants
  ↓ provides: calendarCommand, buildCalendarEmbed()
  ↓ used by: discordBot

discordBot.ts
  ↓ imports: commands/calendar, alerting, channelValidation
  ↓ provides: discordClient, sendEmbed(), initializeDiscordBot()
  ↓ used by: index, notifier, alerting, shutdown, channelValidation

┌────────────────────────────────────────────────────────────────┐
│ UTILITY MODULES (Support)                                      │
└────────────────────────────────────────────────────────────────┘

utils/alerting.ts
  ├─→ discordBot (discordClient)
  └─→ Provides: sendAdminAlert(), sendScraperFailureAlert()

utils/healthCheck.ts
  ├─→ fs, path
  └─→ Provides: startHeartbeat(), checkHealth()

utils/cacheCleanup.ts
  ├─→ config/constants
  └─→ Provides: cleanupCalendarCache(), schedulePeriodicCleanup()

utils/shutdown.ts
  ├─→ discordBot (discordClient)
  └─→ Provides: setupGracefulShutdown(), registerCleanupHandler()

utils/dataValidation.ts
  ├─→ models/event
  └─→ Provides: validateEvent(), shouldAcceptScrapedData()

utils/notificationPersistence.ts
  ├─→ models/event, fs, path
  └─→ Provides: saveNotificationState(), loadNotificationState()

utils/channelValidation.ts
  ├─→ discordBot (discordClient), discord.js types
  └─→ Provides: validateChannel(), validateChannelsOnStartup()

utils/timezoneDisplay.ts
  ├─→ date-fns-tz, config/constants
  └─→ Provides: formatTimeWithTimezone()
```

---

## ⚠️ ISSUES FOUND

### 🔴 **CRITICAL: Circular Import Risk**

**Issue:**
```typescript
// discordBot.ts imports:
import { sendHealthAlert } from './utils/alerting';

// utils/alerting.ts imports:
import { discordClient } from '../discordBot';
```

**Problem:** `discordBot ↔ alerting` circular dependency

**Current State:** Works because alerting only uses `discordClient` (exported const), not functions that depend on alerting. But it's fragile.

**Solution:**
```typescript
// Move discordClient to separate file
src/discordClient.ts:
  export const discordClient = new Client({...});

// Both discordBot.ts and alerting.ts import from discordClient.ts
```

**Risk Level:** Medium (works now, breaks if we're not careful)

### 🟡 **HIGH: Side Effects on Import**

**Issue 1: scheduler.ts (line 50)**
```typescript
cron.schedule(DAILY_SCRAPE_SCHEDULE, updateCalendarEvents);
// This runs immediately on import!
```

**Problem:** `import './scheduler'` in index.ts starts cron job as side effect

**Issue 2: notifier.ts (line 168)**
```typescript
scheduleNotifications().catch(err => console.error(...));
// This runs immediately on import!
```

**Problem:** Notifications scheduled on import, not on explicit call

**Why It's Bad:**
- Hard to test (can't import without triggering)
- Order-dependent (must import after discordClient ready)
- Not obvious from reading index.ts

**Solution:**
```typescript
// scheduler.ts
export function startScheduler() {
  cron.schedule(DAILY_SCRAPE_SCHEDULE, updateCalendarEvents);
}

// index.ts
import { startScheduler } from './scheduler';
...
startScheduler(); // Explicit!
```

**Risk Level:** Medium (works but not idiomatic)

### 🟡 **HIGH: Configuration Scattered**

**Issue:** Not all config in constants.ts

**Examples:**
```typescript
// discordBot.ts:10-12
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 5000;
```

```typescript
// scheduler.ts:8-9
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 60000;
```

**Should be in:** `config/constants.ts`

**Risk Level:** Low (but inconsistent)

### 🟢 **MEDIUM: Global State Pattern**

**Issue:**
```typescript
// Multiple files use globalThis
globalThis.calendarCache
globalThis.notificationTimeouts
```

**Why It's Questionable:**
- Not typed centrally
- Declared in multiple places
- Hard to see what globals exist

**Better Approach:**
```typescript
// src/state/globalState.ts
export const globalState = {
  calendarCache: new Map<string, CacheData>(),
  notificationTimeouts: new Map<string, NodeJS.Timeout[]>(),
};
```

**Risk Level:** Low (works, but could be cleaner)

### 🟢 **MEDIUM: Error Handling Inconsistency**

**Pattern 1: Throw on error (storage.ts, scraper.ts)**
```typescript
throw error; // Let caller handle
```

**Pattern 2: Return null on error (discordBot.ts)**
```typescript
return null; // Swallow error
```

**Pattern 3: Return empty on error (storage.ts)**
```typescript
return []; // Swallow error, return empty
```

**Why Inconsistent:**
- Storage throws on non-ENOENT errors, returns [] on ENOENT
- discordBot returns null on all errors
- scraper throws all errors

**Recommendation:**
- **Data fetching** (scraper, storage) → Throw (caller decides)
- **Discord operations** (sendEmbed) → Return null (degradation)
- **Document pattern** in each module

**Risk Level:** Low (all patterns are valid, just inconsistent)

---

## ✅ GOOD PRACTICES OBSERVED

### **1. Dependency Injection (Where It Matters)**
```typescript
// utils don't create their own clients
utils/alerting.ts: import { discordClient } from '../discordBot';
utils/shutdown.ts: import { discordClient } from '../discordBot';
```
✅ Single source of truth for Discord client

### **2. Type Safety**
- All functions fully typed
- No `any` types (except in error guards)
- Proper null checks
- Interfaces for all data structures

### **3. Error Recovery**
- Retry logic with exponential backoff
- Graceful degradation (fallback channel)
- Validation before mutation (data validation)
- Admin alerts on failures

### **4. Testability**
- Pure functions extracted (formatTimeWithTimezone, validateEvent)
- Business logic separate from I/O
- Test utilities well-organized
- 106 tests, all passing

### **5. Documentation**
- ARCHITECTURE.md covers system design
- TESTING_FLOWS.md explains testing
- CODE_REVIEW.md (this document) captures issues
- Inline comments explain WHY

---

## 📋 Refactoring Opportunities (Prioritized)

### 🔥 **High Priority - Should Fix**

#### 1. **Break Circular Dependency (discordBot ↔ alerting)**
**Effort:** 15 minutes
**Risk:** Low
**Value:** High (architectural cleanliness)

**Changes:**
- Create `src/core/discordClient.ts`
- Move `discordClient` creation there
- Both `discordBot.ts` and `alerting.ts` import from it

#### 2. **Remove Side Effects on Import**
**Effort:** 30 minutes
**Risk:** Low
**Value:** High (testability, clarity)

**Changes:**
- `scheduler.ts`: Export `startScheduler()`, call from index.ts
- `notifier.ts`: Remove auto-schedule on import, call from scheduler
- `index.ts`: Explicit startup sequence

#### 3. **Centralize All Configuration**
**Effort:** 15 minutes
**Risk:** Very Low
**Value:** Medium (consistency)

**Changes:**
- Move `MAX_RECONNECT_ATTEMPTS` to constants.ts
- Move `MAX_RETRIES` to constants.ts
- Move `RECONNECT_DELAY_MS` to constants.ts

### 🟡 **Medium Priority - Nice to Have**

#### 4. **Centralize Global State**
**Effort:** 30 minutes
**Risk:** Low
**Value:** Medium (clarity)

**Changes:**
- Create `src/state/globalState.ts`
- Export typed state object
- Import in all modules that need it

#### 5. **Standardize Error Handling**
**Effort:** 20 minutes
**Risk:** Low
**Value:** Low (already works well)

**Changes:**
- Document error handling philosophy
- Add comments explaining throw vs return null

### 🟢 **Low Priority - Future**

#### 6. **Extract Date Parsing to Utility**
**Effort:** 45 minutes
**Value:** Medium (reusability)

**Changes:**
- Create `utils/dateParser.ts`
- Move `parseEventDateTime`, `parseDateHeader`, etc.
- Reuse in calendar.ts and notifier.ts

#### 7. **Create Service Layer**
**Effort:** 2 hours
**Value:** High (if adding more features)

**Changes:**
- `services/CalendarService.ts` - Encapsulates scraper + storage
- `services/NotificationService.ts` - Encapsulates notification logic
- Better for future features, overkill for current scope

---

## 🎯 Coupling Analysis

### **Tight Coupling (Acceptable)**

**discordBot ↔ commands/calendar:**
- ✅ Acceptable - Commands naturally depend on Discord client
- ✅ One-way import (commands don't import discordBot internals)

**notifier → discordBot:**
- ✅ Acceptable - Notifications need to send Discord messages
- ✅ Uses public API (sendEmbed)

**scheduler → scraper + storage + notifier:**
- ✅ Acceptable - Scheduler orchestrates the pipeline
- ✅ Clear dependency direction

### **Loose Coupling (Good)**

**utils/ modules:**
- ✅ Each util is independent
- ✅ No inter-util dependencies
- ✅ Only import from core modules or external libraries

**config/constants.ts:**
- ✅ Zero dependencies
- ✅ Imported by many (correct for config)

### **Problematic Coupling**

**discordBot ↔ alerting:**
- ❌ Circular import structure
- Fix: Extract discordClient to separate module

---

## 🔒 Cohesion Analysis

### **High Cohesion (Excellent)**

**scraper.ts:**
- ✅ Single responsibility: Fetch data from MarketWatch
- ✅ All functions support scraping
- ✅ 67 lines, focused

**storage.ts:**
- ✅ Single responsibility: Persist events
- ✅ All functions about file I/O
- ✅ 32 lines, minimal

**dataValidation.ts:**
- ✅ Single responsibility: Validate event data
- ✅ All functions about validation
- ✅ 109 lines, cohesive

### **Medium Cohesion (Acceptable)**

**notifier.ts:**
- ⚠️ Does multiple things: Grouping, scheduling, updating
- ⚠️ Could split: notificationScheduler.ts + notificationUpdater.ts
- ✅ But all related to notifications, acceptable

**discordBot.ts:**
- ⚠️ Discord client + command handling + pagination + reconnect
- ⚠️ Could split: client.ts + commandHandler.ts + reconnectHandler.ts
- ✅ But all Discord-related, acceptable for bot size

### **Low Cohesion (Needs Attention)**

**globalSetup.ts:**
- ❌ Does 4 unrelated things:
  1. FAKE_DATE override (testing)
  2. RESCRAPE logic (startup)
  3. Environment variable validation
  4. Unhandled rejection handler (removed but was there)

**Should split to:**
- `src/testing/fakeDateSetup.ts` - Testing utilities
- `src/startup/envValidation.ts` - Environment checks
- Keep RESCRAPE in globalSetup or move to index.ts

**Risk:** Low (works fine, just not well-organized)

---

## 🧪 Test Organization Review

### **Structure: Excellent** ✅

```
tests/
├── commands/         ← Command logic
├── events/          ← Notification logic
├── utils/           ← Utility functions (8 files!)
├── integration/     ← Data pipeline tests
├── scraper.test.ts  ← Scraper tests
└── discordBot.test.ts ← Discord tests
```

**Mirrors src/ structure perfectly** ✅

### **Coverage Distribution**

| Module | Tests | Coverage |
|--------|-------|----------|
| **utils/** | 70 tests | Comprehensive (8 util files) |
| **commands/** | 16 tests | Good (unit level) |
| **events/** | 9 tests | Good (beat/miss logic) |
| **integration/** | 9 tests | Good (pipeline) |
| **scraper/** | 6 tests | Adequate (timeout, errors) |
| **discordBot/** | 10 tests | Adequate (reconnect logic) |

**Total: 106 tests, well-distributed** ✅

### **Test Quality: High**

- ✅ Fast (< 7 seconds for all 106 tests)
- ✅ Deterministic (no flaky tests observed)
- ✅ Isolated (each test independent)
- ✅ Clear names (`should validate event with missing date`)

---

## 🔧 Configuration Management Review

### **Current State:**

**Well-Centralized:**
```typescript
// config/constants.ts
DATES_PER_PAGE = 5
NOTIFICATION_EARLY_WARNING_MINUTES = 30
SCRAPER_TIMEOUT_MS = 15000
SCRAPER_URL = '...'
// ... 20+ constants
```

**Still Scattered:**
```typescript
// discordBot.ts
const MAX_RECONNECT_ATTEMPTS = 5;      // Should be in constants
const RECONNECT_DELAY_MS = 5000;       // Should be in constants

// scheduler.ts
const MAX_RETRIES = 3;                 // Should be in constants
const RETRY_DELAY_MS = 60000;          // Should be in constants

// utils/healthCheck.ts
const HEARTBEAT_INTERVAL_MS = 60000;   // Should be in constants
```

**Recommendation:** Move all to constants.ts

---

## 🔗 Dependency Direction Analysis

### **Dependency Rules (Current)**

```
Core Business Logic
  ↑ (depends on)
Utils & Helpers
  ↑ (depends on)
Config & Models
```

**Validation:**
- ✅ No util depends on another util
- ✅ No model depends on anything
- ✅ Config has zero dependencies
- ✅ Core modules only depend on utils/config/models
- ❌ Exception: alerting → discordBot (circular)

### **Clean Dependencies** ✅

**Good Examples:**
```
scraper.ts → models/event ✅
storage.ts → models/event ✅
dataValidation.ts → models/event ✅
timezoneDisplay.ts → config/constants ✅
```

**Problem Example:**
```
discordBot.ts → utils/alerting ❌
utils/alerting.ts → discordBot ❌
(Circular!)
```

---

## 📏 Module Size Review

| File | Lines | Assessment |
|------|-------|------------|
| **notifier.ts** | 168 | ✅ Good (complex domain) |
| **commands/calendar.ts** | 183 | ✅ Good (lots of formatting) |
| **scraper.ts** | 70 | ✅ Excellent (focused) |
| **discordBot.ts** | 130 | ✅ Good (handles reconnects now) |
| **scheduler.ts** | 51 | ✅ Excellent |
| **storage.ts** | 32 | ✅ Excellent |
| **dataValidation.ts** | 109 | ✅ Good (thorough validation) |
| **healthCheck.ts** | 74 | ✅ Good |
| **channelValidation.ts** | 97 | ✅ Good |

**Average:** 102 lines per module
**Assessment:** ✅ Well-sized, nothing bloated

---

## 🎨 Code Style Consistency

### **Import Organization: Excellent** ✅

All files follow pattern:
```typescript
// 1. Discord.js / Third-party
import { Client } from 'discord.js';
import axios from 'axios';

// 2. Internal - absolute imports
import { CalendarEvent } from './models/event';
import { CONSTANTS } from './config/constants';

// 3. Internal - relative imports
import { utilFunction } from './utils/helper';
```

### **Error Handling: Consistent** ✅

**Pattern observed:**
```typescript
try {
  // Operation
} catch (error) {
  console.error('Context:', error);
  // Throw or return based on module type
}
```

### **Null Safety: Excellent** ✅

**Before V2:**
```typescript
parseEventDateTime(evt)!  // Dangerous!
```

**After V2:**
```typescript
const evtTime = parseEventDateTime(evt);
if (!evtTime || evtTime.getTime() <= Date.now()) continue;
```

---

## 🚨 Critical Issues to Fix

### **1. Circular Dependency (discordBot ↔ alerting)**

**Current:**
```
discordBot.ts:4: import { sendHealthAlert } from './utils/alerting';
alerting.ts:1: import { discordClient } from '../discordBot';
```

**Fix:**
```typescript
// Create src/core/discordClient.ts
export const discordClient = new Client({...});

// discordBot.ts
import { discordClient } from './core/discordClient';

// utils/alerting.ts
import { discordClient } from '../core/discordClient';
```

### **2. Side Effects on Import**

**Current:**
```typescript
// index.ts:4
import './scheduler';  // Side effect: starts cron job!
```

**Fix:**
```typescript
// scheduler.ts - Remove line 50, add:
export function startScheduler() {
  cron.schedule(DAILY_SCRAPE_SCHEDULE, updateCalendarEvents);
}

// index.ts
import { startScheduler } from './scheduler';
startScheduler(); // Explicit!
```

### **3. Centralize Remaining Constants**

**Move to constants.ts:**
- MAX_RECONNECT_ATTEMPTS (from discordBot.ts)
- RECONNECT_DELAY_MS (from discordBot.ts)
- MAX_RETRIES (from scheduler.ts)
- RETRY_DELAY_MS (from scheduler.ts)
- HEARTBEAT_INTERVAL_MS (from healthCheck.ts)

---

## 🎯 Recommended Refactoring Plan

### **Phase 1: Critical Fixes (30 minutes)**
1. Extract discordClient to separate file
2. Remove side effects (make imports explicit)
3. Centralize all constants

### **Phase 2: Organization (1 hour)**
4. Centralize global state
5. Document error handling patterns
6. Add architectural decision records (ADR)

### **Phase 3: Future (2+ hours)**
7. Extract date parsing utilities
8. Consider service layer (if adding features)

---

## 📊 Overall Assessment

### **Strengths:**
- ✅ **Excellent test coverage** (106 tests)
- ✅ **Clear module boundaries** (commands, utils, config)
- ✅ **Good separation of concerns** (scraper, storage, notifier)
- ✅ **Consistent code style** (follows .ai/rules)
- ✅ **Comprehensive error handling** (timeout, retry, validation)
- ✅ **Well-documented** (README, ARCHITECTURE, TESTING_FLOWS)

### **Weaknesses:**
- ⚠️ **Circular dependency** (discordBot ↔ alerting) - **MUST FIX**
- ⚠️ **Side effects on import** (scheduler, notifier) - **SHOULD FIX**
- ⚠️ **Scattered constants** (5 files vs 1) - **SHOULD FIX**
- 🟢 **Global state pattern** (could be cleaner) - **NICE TO HAVE**

### **Verdict:**

**Current State:** Production-ready with minor organizational issues

**Recommendation:** Fix critical issues (30 min work), then ship

**Post-Ship:** Consider Phase 2 refactoring for long-term maintainability

---

## ✅ Action Items

**Before Merge:**
1. ✅ Fix circular dependency (discordBot ↔ alerting)
2. ✅ Remove side effects (scheduler, notifier)
3. ✅ Centralize constants

**After Merge (Nice to Have):**
4. Centralize global state
5. Extract date parsing utilities
6. Add ADR documentation

**Priority:** Fix items 1-3 before merging to master

---

**Review Status:** Complete
**Next Step:** Implement 3 critical fixes (30 minutes), then merge

