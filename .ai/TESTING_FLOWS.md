# Testing Flows - Explicit Purpose Documentation

## Overview

This document explicitly defines **what we're testing**, **why we're testing it**, and **how to use each testing tool**.

---

## 🎯 Testing Goals

### Primary Objectives
1. **Validate scraper accuracy** - MarketWatch HTML parsing works correctly
2. **Test notification timing** - Alerts trigger at correct times (30min, 1min, post-event)
3. **Verify data pipeline** - Scrape → Storage → Display → Notifications
4. **Support development** - Generate realistic data without hitting MarketWatch repeatedly

### Non-Goals
- ❌ Replace production monitoring
- ❌ Load testing (bot serves one Discord server)
- ❌ Security testing (Discord handles auth)

---

## 🔧 Testing Tools - Explicit Purpose

### 1. **Live Scraper Validation** (`npm run test:live-scrape`)

**WHAT:** Scrapes MarketWatch right now and validates the data structure

**WHY:**
- MarketWatch can change HTML structure anytime
- Detects scraper breakage before users see errors
- Validates our parser handles all edge cases (TBA times, negative values, etc.)

**WHEN TO USE:**
- ✅ Before deploying bot updates
- ✅ After MarketWatch layout changes
- ✅ When investigating scraper failures
- ✅ Weekly as part of health check

**WHAT IT VALIDATES:**
- ✅ Date format: `MONDAY, OCT. 6`
- ✅ Time format: `8:30 am` or `TBA`
- ✅ Event structure (all 6 fields present)
- ✅ Forecast/Previous values exist for economic data
- ✅ Fed speeches identified correctly

**OUTPUT:**
```
✅ Scrape completed in 246ms
📊 Statistics:
   Total Events: 89
   Unique Dates: 15
   Events with Forecasts: 24
   Events with Actuals: 18
   Fed Speeches: 19
```

**Exit codes:**
- 0 = Success, scraper working
- 1 = Failure, needs investigation

---

### 2. **Cron Job Trigger Test** (`npm run test:trigger-cron`)

**WHAT:** Sets up FAKE_DATE to trigger the daily 3 AM cron job in ~60 seconds

**WHY:**
- Tests scheduler without waiting until 3 AM
- Validates scraper runs on schedule
- Confirms data updates and notifications reschedule

**WHEN TO USE:**
- ✅ Testing scheduler changes
- ✅ Verifying cron configuration
- ✅ Debugging "why aren't events updating" issues

**HOW IT WORKS:**
1. Generates test events
2. Calculates FAKE_DATE = 2:59 AM EST (current day)
3. Provides command to copy/paste
4. Cron triggers 60 seconds after bot start

**WHAT TO WATCH FOR:**
```
[T+60s] Log: "Scraping calendar events (attempt 1/3)..."
[T+65s] Log: "Events updated and notifications refreshed (89 events)."
[T+66s] Log: "Scheduled notification for..." (multiple)
```

**VALIDATES:**
- ✅ Cron schedule fires correctly
- ✅ Scraper executes on schedule
- ✅ Events save successfully
- ✅ Notifications reschedule after update

---

### 3. **Notification Trigger Test** (`npm run test:trigger-notif`)

**WHAT:** Generates events 31 minutes in the future to trigger 30-min alert in 1 minute

**WHY:**
- Tests notification system without waiting 30 minutes
- Validates alert timing (30min → 1min → post-event update)
- Tests Discord embed formatting and colors

**WHEN TO USE:**
- ✅ Testing notification changes
- ✅ Verifying Discord embeds display correctly
- ✅ Testing beat/miss color logic
- ✅ Debugging "notifications not sending" issues

**HOW IT WORKS:**
1. Generates 3 events at +31, +32, +35 minutes from now
2. Sets FAKE_DATE to current time
3. Bot schedules notifications:
   - 30-min alert at T+1 minute (31 - 30 = 1)
   - 1-min alert at T+30 minutes (31 - 1 = 30)
   - Post-event update at T+31.5 minutes

**TIMELINE:**
```
[T+0s]    Bot starts
[T+60s]   🟡 30-minute notification (yellow embed)
[T+30m]   🟠 1-minute notification (orange embed)
[T+31.5m] Event time passes
[T+33m]   🔵 Post-event update scrapes MarketWatch for actuals
```

**VALIDATES:**
- ✅ Notification scheduling math correct
- ✅ 30-min alert sends
- ✅ 1-min alert sends
- ✅ Post-event update triggers
- ✅ Scraper fetches fresh data for actuals
- ✅ Embed colors match scenarios (yellow → orange → green/red)

---

### 4. **Full Flow End-to-End** (`npm run test:full-flow`)

**WHAT:** Complete data pipeline test from scrape to notification timeline

**WHY:**
- Validates entire system in one command
- Quick health check before deployment
- Shows exactly what bot will do with current data

**WHEN TO USE:**
- ✅ Before deploying to production
- ✅ After major refactors
- ✅ Daily health check
- ✅ When troubleshooting "bot not working"

**WHAT IT DOES:**
```
PHASE 1: Scrapes MarketWatch (live)
PHASE 2: Saves to storage and verifies
PHASE 3: Analyzes data quality
PHASE 4: Shows preview of what Discord would display
PHASE 5: Calculates when notifications would trigger
```

**OUTPUT SHOWS:**
- Live scrape results (89 events)
- Data statistics (dates, forecasts, actuals)
- Preview of Discord display
- Notification schedule for next 5 events

**VALIDATES:**
- ✅ Scraper → Storage → Retrieval pipeline
- ✅ Data format matches expectations
- ✅ Notification timing calculations
- ✅ Ready for production deployment

---

## 🧪 Test Data Generator - Explicit Purpose

### `npm run test:generate-data [type]`

**WHAT:** Creates synthetic economic calendar data without hitting MarketWatch

**WHY:**
- Avoid rate limiting MarketWatch during development
- Test edge cases (year rollover, negative values)
- Reproducible test scenarios
- Faster than live scraping (instant vs ~250ms)

**TYPES:**

#### `standard` (Default)
```bash
npm run test:generate-data
```
**Generates:** 14 days of future events
**Purpose:** General testing of /calendar command
**Use case:** Daily development, testing pagination

#### `past`
```bash
npm run test:generate-data past
```
**Generates:** Events from 2 hours ago with actuals populated
**Purpose:** Test notification update logic (beat/miss scenarios)
**Use case:** Testing post-event embed updates

#### `rollover`
```bash
npm run test:generate-data rollover
```
**Generates:** Fixed Dec 28, Jan 5, Jan 10 events
**Purpose:** Test year boundary parsing
**Use case:** November/December deployment testing

#### `mixed`
```bash
npm run test:generate-data mixed
```
**Generates:** Past + future events
**Purpose:** Test complete scenarios
**Use case:** Comprehensive manual testing

---

## 📊 View Test Data (`npm run test:view-data`)

**WHAT:** Pretty-prints stored events in terminal

**WHY:**
- Verify generated data before starting bot
- Debug data issues
- Confirm timezone display works

**OUTPUT:**
```
📊 Viewing Stored Test Data
Display Timezone: America/Chicago

MONDAY, OCT. 6
  8:30 am    - U.S. trade deficit (F: $-60.7B | P: -$78.3B)
  10:00 am   - Atlanta Fed President Raphael Bostic speaks
```

---

## 🔄 Complete Testing Workflows

### **Workflow 1: Test Cron Job (Scraper Scheduling)**

**Goal:** Verify daily 3 AM scraper runs correctly

**Steps:**
```bash
# 1. Setup test environment
npm run test:trigger-cron

# 2. Copy the FAKE_DATE command shown
FAKE_DATE=2025-10-05T12:59:00.000Z npm run start

# 3. Wait 60 seconds

# 4. Watch logs for:
✅ "Scraping calendar events (attempt 1/3)..."
✅ "Events updated and notifications refreshed (X events)."

# 5. Verify data updated
npm run test:view-data
```

**What You're Testing:**
- Cron schedule configuration (0 3 * * *)
- Scraper execution on schedule
- Storage update mechanism
- Notification rescheduling after data refresh

---

### **Workflow 2: Test Notifications (Alert Timing)**

**Goal:** Verify 30-min, 1-min, and post-event notifications

**Steps:**
```bash
# 1. Setup notification test
npm run test:trigger-notif

# 2. Copy the FAKE_DATE command shown
FAKE_DATE=2025-10-06T08:21:58.143Z npm run start

# 3. Timeline:
[T+60s]  Check Discord for yellow 30-min alert
[T+30m]  Check Discord for orange 1-min alert
[T+33m]  Check Discord for updated embed with actuals

# 4. Verify in Discord:
✅ Yellow embed received at T+60s
✅ Orange embed received at T+30m
✅ Updated embed with actual values (green/red color)
```

**What You're Testing:**
- Notification scheduling math (addMinutes logic)
- Discord embed sending
- Color coding (yellow → orange → green/red)
- Post-event scraper triggering
- Actual value parsing and display

---

### **Workflow 3: Test Full Pipeline (Health Check)**

**Goal:** Validate complete system before deployment

**Steps:**
```bash
# 1. Run full flow test
npm run test:full-flow

# 2. Review output from all 5 phases:
✅ PHASE 1: Scrape successful
✅ PHASE 2: Storage working
✅ PHASE 3: Data looks valid
✅ PHASE 4: Display preview looks good
✅ PHASE 5: Notification timeline calculated

# 3. If all pass → Ready for production
npm run start
```

**What You're Testing:**
- End-to-end data flow
- Current MarketWatch compatibility
- Storage integrity
- Notification readiness

---

### **Workflow 4: Manual Calendar Command Testing**

**Goal:** Test /calendar Discord command manually

**Steps:**
```bash
# 1. Generate test data
npm run test:generate-data

# 2. Start bot normally
npm run start

# 3. In Discord, run:
/calendar

# 4. Verify:
✅ Events display in pages
✅ "Previous page" button disabled on page 1
✅ "Next page" button works
✅ Times shown in your timezone (if DISPLAY_TIMEZONE set)
✅ No past events shown
✅ Events sorted chronologically
```

**What You're Testing:**
- Discord slash command registration
- Interaction handling (deferred replies)
- Pagination logic
- Button click handling
- Embed formatting
- Timezone display

---

## 🎓 Understanding Test vs Script

### **Automated Tests** (Jest)
**Location:** `tests/`
**Run:** `npm test`
**Purpose:** Continuous validation of code logic

**What they test:**
- Pure functions (date parsing, beat/miss prediction)
- Data contracts (event structure, storage format)
- Business logic (grouping, filtering, formatting)

**When they run:**
- On every code change (watch mode)
- Before commits (manual verification)
- In CI/CD (future)

---

### **Manual Test Scripts** (ts-node)
**Location:** `src/scripts/`
**Run:** `npm run test:*`
**Purpose:** Interactive testing of live system

**What they test:**
- Real scraper against live MarketWatch
- Bot behavior with time manipulation (FAKE_DATE)
- Discord interactions (manual verification)
- Complete data flows

**When they run:**
- During development (on-demand)
- Before deployment (health check)
- When debugging issues (diagnostic)

---

## 📋 Feature Testing Matrix

| Feature | Unit Tests | Integration Tests | Manual Scripts | E2E (Future) |
|---------|-----------|-------------------|----------------|--------------|
| **Date Parsing** | ✅ Yes | ✅ Format validation | ✅ Live data check | - |
| **Event Grouping** | ✅ Yes | ✅ Generator output | ✅ View data | - |
| **Pagination** | ✅ Yes | - | ✅ Discord /calendar | ❌ Needed |
| **Beat/Miss Logic** | ✅ Yes | ✅ Past event gen | ✅ Notification test | - |
| **Storage** | - | ✅ Yes | ✅ Full flow | - |
| **Scraper** | ❌ Needed | ✅ Format check | ✅ Live scrape | - |
| **Notifications** | ❌ Needed | - | ✅ Trigger test | ❌ Needed |
| **Cron Scheduler** | - | - | ✅ Trigger test | ❌ Needed |
| **Discord Commands** | - | - | ✅ Manual /calendar | ❌ Needed |
| **Timezone Display** | ❌ Needed | ✅ Generator | ✅ View data | - |

**Legend:**
- ✅ Implemented and working
- ❌ Needed (high value to add)
- `-` Not applicable or low value

---

## 🚀 Quick Reference

### Before Committing Code
```bash
npm test              # Run all automated tests
npm run build         # Verify TypeScript compiles
```

### Before Deploying to Production
```bash
npm run test:full-flow    # Complete health check
npm run test:live-scrape  # Verify scraper works
```

### When Testing New Features
```bash
npm run test:generate-data    # Create test data
npm run test:view-data        # Inspect it
npm run start                 # Test manually
```

### When Debugging Issues
```bash
npm run test:live-scrape      # Is scraper broken?
npm run test:full-flow        # Where in pipeline is it failing?
npm run test:view-data        # Is data corrupted?
```

---

## 💡 Advanced Testing Scenarios

### Scenario: Test Year Rollover (December 31st)
```bash
# 1. Generate rollover data
npm run test:generate-data rollover

# 2. Set fake date to Dec 31
FAKE_DATE=2025-12-31T12:00:00.000Z npm run start

# 3. Run /calendar in Discord
# 4. Verify January events show up (not filtered as "old")
```

### Scenario: Test Notification Full Cycle
```bash
# 1. Setup notification test
npm run test:trigger-notif
# Copy the FAKE_DATE command

# 2. Start bot with fake time
FAKE_DATE=<from above> npm run start

# 3. Timeline:
[1 min]   Check Discord - yellow 30-min alert
[30 min]  Check Discord - orange 1-min alert
[33 min]  Check Discord - updated with actuals (green/red)

# 4. Validate:
✅ All 3 notifications received
✅ Colors correct (yellow → orange → green/red)
✅ Actuals populated in final update
```

### Scenario: Stress Test Cron with Retries
```bash
# 1. Disconnect internet
# 2. Trigger cron
npm run test:trigger-cron
FAKE_DATE=<from above> npm run start

# 3. Watch logs for retry mechanism:
[T+60s]  "attempt 1/3" - FAIL
[T+120s] "attempt 2/3" - FAIL
[T+180s] "attempt 3/3" - FAIL
[T+181s] "Failed to update calendar after 3 attempts"

# 4. Reconnect internet, wait for next day's cron
```

---

## 🎯 Testing Coverage Philosophy

### What We Test with Automation (Jest)
- **Pure logic** - Math, string formatting, date calculations
- **Data contracts** - Event structure, JSON format
- **Business rules** - Beat/miss prediction, filtering

### What We Test Manually (Scripts)
- **External integrations** - MarketWatch scraping, Discord API
- **Time-dependent flows** - Cron jobs, notifications
- **User interactions** - Slash commands, button clicks

### What We Don't Test
- **Third-party libraries** - Discord.js, axios, cheerio (already tested)
- **Obvious code** - Simple getters, constants
- **Visual appearance** - Embed colors, formatting (manual review)

---

## 📈 Success Metrics

### Automated Test Suite
- ✅ 34 tests passing
- ✅ < 3 second execution time
- ✅ No flaky tests
- ✅ Zero dependencies on external services

### Manual Test Scripts
- ✅ 4 flow scripts operational
- ✅ Live scraper validates 89 events
- ✅ Notification triggers in ~1 minute
- ✅ Cron triggers in ~60 seconds
- ✅ Full flow completes in ~5 seconds

---

## 🔮 Future Enhancements

### High Value Additions
1. **Add scraper unit tests** with mocked axios
2. **Add timezone display tests** for conversion accuracy
3. **Add notification grouping tests** (timing-independent)
4. **Add E2E framework** (discord.js-mock or similar)

### Lower Priority
5. Snapshot tests for embed formatting
6. Performance benchmarks
7. Load testing (multiple concurrent /calendar commands)
8. Security scanning

---

**Updated:** 2025-10-05
**Next Review:** When adding new features or debugging production issues
