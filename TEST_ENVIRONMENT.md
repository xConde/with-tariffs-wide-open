# Test Environment Guide

## Overview

Comprehensive testing infrastructure for the Discord Economic Calendar Bot with support for:
- ✅ Timezone-aware display (ET source → your local timezone)
- ✅ Realistic test data generation
- ✅ Manual testing commands
- ✅ Integration test suite
- ✅ Unit test coverage

---

## 🌎 Timezone Configuration

The bot now supports displaying times in your preferred timezone while keeping internal logic in Eastern Time.

### Setup

Add to your `.env` file:

```bash
DISPLAY_TIMEZONE=America/Chicago  # For Central Time (default)
# OR
DISPLAY_TIMEZONE=America/Los_Angeles  # For Pacific Time
# OR
DISPLAY_TIMEZONE=America/Denver  # For Mountain Time
```

**Supported Timezones:**
- `America/New_York` - Eastern Time (ET)
- `America/Chicago` - Central Time (CT) **[Default]**
- `America/Denver` - Mountain Time (MT)
- `America/Los_Angeles` - Pacific Time (PT)
- `America/Phoenix` - Mountain Standard Time (MST)
- `America/Anchorage` - Alaska Time (AKT)
- `Pacific/Honolulu` - Hawaii-Aleutian Time (HST)

### How It Works

- **Source Data**: Always in ET (MarketWatch publishes in Eastern Time)
- **Internal Logic**: Event scheduling stays in ET for accuracy
- **Display**: Times shown to users in configured timezone

**Example Output:**
```
• 8:30 am ET (7:30 am CT) - Consumer Price Index (F: 0.4% | P: 0.3%)
```

If `DISPLAY_TIMEZONE` matches `America/New_York`, only ET is shown:
```
• 8:30 am ET - Consumer Price Index (F: 0.4% | P: 0.3%)
```

---

## 🧪 Test Data Generator

Generate realistic economic calendar data for testing without scraping MarketWatch.

### Quick Start

```bash
# Generate 14 days of future events
npm run test:generate-data

# View the generated data
npm run test:view-data
```

### Available Datasets

#### 1. **Standard Future Events** (Default)
```bash
npm run test:generate-data standard
# OR
npm run test:generate-data
```
- Generates 14 days of upcoming events
- Random mix of economic indicators and Fed speeches
- 2-6 events per day
- Realistic forecast/previous values

#### 2. **Past Events with Actuals** (For Notification Testing)
```bash
npm run test:generate-data past
```
- Generates events from 2 hours ago
- Includes actual values (for beat/miss scenarios)
- Tests notification update logic
- Includes both "beat forecast" and "missed forecast" examples

#### 3. **Year Rollover Test Data**
```bash
npm run test:generate-data rollover
```
- December events (current year)
- January events (next year)
- Tests year rollover logic
- Critical for Nov/Dec testing

#### 4. **Mixed Dataset**
```bash
npm run test:generate-data mixed
```
- Combination of past (with actuals) and future events
- Useful for comprehensive testing

### View Test Data

```bash
npm run test:view-data
```

**Output Example:**
```
📊 Viewing Stored Test Data

Display Timezone: America/Chicago

Found 61 events:

MONDAY, OCT. 6
  8:30 am    - U.S. trade deficit (F: $-60.7B | P: -$78.3B)
  10:00 am   - Atlanta Fed President Raphael Bostic speaks
  3:00 pm    - Consumer credit (F: $14.0B | P: $16.0B)

TUESDAY, OCT. 7
  8:30 am    - Consumer price index (F: 0.4% | P: 0.3%)
  9:30 am    - Federal Reserve governor Michael Barr speaks
...
```

---

## 🧰 Test Commands

### Unit Tests
```bash
# Run all unit tests
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# With coverage report
npm run test:coverage
```

**Current Coverage:** 25 unit tests passing

### Integration Tests
```bash
# Run integration tests only
npm run test:integration
```

**Test Coverage:**
- Test data generation validation
- Storage read/write operations
- Event format validation (dates, times, economic data)
- Data persistence and overwrites

### All Tests
```bash
npm test
```

**Current Status:** 34 total tests passing ✅

---

## 📋 Testing Workflows

### Testing the `/calendar` Command

1. **Generate test data**:
   ```bash
   npm run test:generate-data
   ```

2. **Start the bot** (dev environment):
   ```bash
   npm run start
   ```

3. **In Discord**, run:
   ```
   /calendar
   ```

4. **Verify**:
   - Events display in your configured timezone
   - Pagination works (Previous/Next buttons)
   - No past events shown
   - Events sorted chronologically

### Testing Notifications

1. **Generate past events**:
   ```bash
   npm run test:generate-data past
   ```

2. **Manually trigger** (optional):
   ```bash
   # In your code, temporarily adjust notification times
   # or use FAKE_DATE environment variable
   ```

3. **Verify**:
   - 30-minute warning sent
   - 1-minute warning sent
   - Post-event update with actual values
   - Beat/miss indicators display correctly

### Testing Year Rollover

1. **Generate rollover data** (best done in Nov/Dec):
   ```bash
   npm run test:generate-data rollover
   ```

2. **Set FAKE_DATE** (optional):
   ```bash
   FAKE_DATE=2025-12-28T12:00:00.000Z npm run start
   ```

3. **Verify**:
   - January events appear (not filtered as "old")
   - December events before today are filtered
   - Dates parse correctly

---

## 🔧 Development Tips

### Custom Test Data

Modify `src/utils/testDataGenerator.ts` to:
- Add new economic indicators
- Adjust event frequencies
- Create specific test scenarios

### Timezone Testing

Test different timezones without changing `.env`:
```typescript
DISPLAY_TIMEZONE=America/Los_Angeles npm run test:view-data
```

### Debug Mode

View full event objects:
```bash
node -e "const {getStoredEvents} = require('./dist/storage'); getStoredEvents().then(e => console.log(JSON.stringify(e, null, 2)))"
```

---

## 📁 Test File Locations

```
with-tariffs-wide-open/
├── tests/
│   ├── commands/
│   │   └── calendar.test.ts          # Calendar command unit tests
│   ├── events/
│   │   └── notifierMessage.test.ts   # Notification logic tests
│   ├── utils/
│   │   └── cacheCleanup.test.ts      # Cache management tests
│   └── integration/
│       └── calendar.integration.test.ts  # Integration tests
├── src/
│   ├── utils/
│   │   ├── testDataGenerator.ts      # Test data generator
│   │   └── timezoneDisplay.ts        # Timezone formatting
│   └── scripts/
│       ├── generateTestData.ts       # CLI for data generation
│       └── viewTestData.ts           # CLI for viewing data
└── data/
    └── events.json                   # Generated test data storage
```

---

## 🐛 Troubleshooting

### "No events found"
```bash
npm run test:generate-data
npm run test:view-data
```

### Timezone not showing correctly
Check `.env` file has valid `DISPLAY_TIMEZONE` value

### Tests failing
```bash
npm run build
npm test
```

### Integration tests can't find data
```bash
# Clean up and regenerate
rm -rf data/events.json
npm run test:generate-data
```

---

## ✅ Pre-Deployment Checklist

- [ ] All tests passing (`npm test`)
- [ ] Build successful (`npm run build`)
- [ ] Timezone configured correctly in `.env`
- [ ] Test data generated and viewable
- [ ] `/calendar` command tested with real data
- [ ] Notifications tested (if applicable)
- [ ] Year rollover logic tested (if in Nov/Dec)

---

**Questions?** Check the main `README.md` or `claude.md` for project documentation.
