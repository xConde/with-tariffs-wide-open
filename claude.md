# Claude Configuration & Quick Start

## Initialization

When starting a new session, Claude will automatically read this file and prepare the development environment.

## Essential Rules to Load

Claude should immediately read these rule files to understand the project:

1. **Workflow Standards**: `/.ai/rules/workflow.mdc`
2. **Code Style**: `/.ai/rules/code-style.mdc`
3. **Discord Bot Patterns**: `/.ai/rules/discord-bot-patterns.mdc`
4. **Testing Strategy**: `/.ai/TESTING_STRATEGY.md`
5. **Testing Flows**: `/.ai/TESTING_FLOWS.md`

## Quick Command Reference

### Development Commands

- **"build"** - Compile TypeScript to JavaScript
- **"start"** - Deploy commands and start the bot
- **"commit ready"** - Create git commit with proper message
- **"pr ready"** - Create pull request with description

### Testing Commands

- **"test flow"** - Run complete flow validation (`npm run test:full-flow`)
- **"validate scraper"** - Test live MarketWatch scraping (`npm run test:live-scrape`)
- **"test notifications"** - Setup notification trigger test (`npm run test:trigger-notif`)
- **"test cron"** - Setup cron job trigger test (`npm run test:trigger-cron`)

### Analysis Commands

- **"check errors"** - Run build and identify TypeScript errors
- **"review code"** - Analyze codebase for improvements
- **"check coverage"** - Run tests with coverage report

## Active Project Context

**Primary Project**: Discord Economic Calendar Bot
**Key Features**:
- `/calendar` slash command for economic event display
- Daily automated scraping from MarketWatch
- Scheduled notifications (30min and 1min before events)
- Multi-page embeds with button navigation
- Automatic data updates post-event

## Common Tasks

### Starting Development
1. Ensure environment variables are set in `.env`
2. Run `npm run build` to compile TypeScript
3. Run `npm run start` to deploy commands and start bot

### Adding New Features
1. Follow Discord.js v14 patterns from `discord-bot-patterns.mdc`
2. Maintain type safety (no `any` types)
3. Test with FAKE_DATE if date-dependent
4. Build before committing

### Fixing Bugs
1. Identify root cause
2. Implement fix following existing patterns
3. Test thoroughly
4. Build to verify no regressions

## Important Paths

- Rules: `/.ai/rules/`
- Testing Docs: `/.ai/TESTING_STRATEGY.md` and `/.ai/TESTING_FLOWS.md`
- Source code: `/src/`
- Commands: `/src/commands/`
- Models: `/src/models/`
- Test Scripts: `/src/scripts/`
- Build output: `/dist/`
- Test coverage: `/coverage/` (gitignored)

## Code Quality Standards

### Type Safety
- **NEVER use 'any' type** - Always use proper TypeScript types
- **NEVER use type casting** - Use proper type guards instead
- All function parameters and returns must be typed
- Use interfaces for data structures

### Error Handling
- Wrap async operations in try/catch
- Log errors with context
- Provide user-friendly error messages
- Use ephemeral messages for Discord errors

### Discord.js Patterns
- Always defer long operations (>3s)
- Check interaction state before replying
- Handle all interaction states (deferred, replied, etc.)
- Use ephemeral messages for errors
- Clean up timeouts and global state

### Code Organization
- Keep functions small and focused (<50 lines)
- Use descriptive variable names
- Group related functionality
- Export clear interfaces

## Environment Variables

Required in `.env`:
- `DISCORD_TOKEN` - Bot authentication token
- `DISCORD_CHANNEL_ID` - Target channel for notifications
- `CLIENT_ID` - Discord application client ID

Optional:
- `FAKE_DATE` - ISO 8601 date for testing (EST-based)
- `RESCRAPE` - Set to 1 to force data update on startup

## Architecture Overview

### Data Flow
1. **Scraper** (`scraper.ts`) - Fetches data from MarketWatch
2. **Storage** (`storage.ts`) - Persists to local JSON file
3. **Scheduler** (`scheduler.ts`) - Daily cron job updates data
4. **Notifier** (`notifier.ts`) - Schedules and sends notifications
5. **Commands** (`commands/calendar.ts`) - User-triggered display

### Event Lifecycle
1. Daily scrape at 3 AM (cron job)
2. Events stored in `calendar-events.json`
3. Notifications scheduled (30min & 1min before)
4. 1-minute alert updates after event with actual values
5. Old events filtered from display

## Testing Protocol

### Date-Based Testing
Use `FAKE_DATE` environment variable:
```bash
FAKE_DATE=2025-03-17T07:28:58.000Z npm run start
```

### Build Verification
Always run before committing:
```bash
npm run build
```

### Manual Testing Checklist
- [ ] `/calendar` command shows events
- [ ] Pagination buttons work correctly
- [ ] Buttons disable at boundaries
- [ ] Notifications schedule correctly
- [ ] Error messages are user-friendly
- [ ] No TypeScript errors

## Session Start Protocol

1. Read all rules in `/.ai/rules/`
2. Read testing documentation: `/.ai/TESTING_STRATEGY.md` and `/.ai/TESTING_FLOWS.md`
3. Verify git branch and status
4. Check for uncommitted changes
5. Ready for commands

## Code Review Workflow

When working on features:

1. **Implementation Phase**:
   - Complete the feature according to specs
   - Test functionality
   - Self-review the code

2. **Pre-Commit Check-In**:
   - **ALWAYS** check in with user before committing
   - Present work for review
   - Include self-assessment

3. **Commit Process**:
   - After approval, create atomic commit
   - Write clear commit message (WHY, not WHAT)
   - Include co-author if appropriate

## Historical Context

### Version 1.1 Refactor (Recent)
- Extended notification system with post-event updates
- Implemented FAKE_DATE for development testing
- Added rescrape fallback mechanism
- Optimized and modularized codebase
- Improved reliability and maintainability

### Key Lessons Learned
- Always complete refactors atomically
- Build before every commit
- Test date-dependent features thoroughly
- Maintain backward compatibility
- Document environment variables

## Common Issues & Solutions

### Bot Not Responding
- Check `DISCORD_TOKEN` is valid
- Verify bot has proper permissions in server
- Ensure commands were deployed with `deploy-commands.js`

### Scraping Failures
- MarketWatch may have changed HTML structure
- User agent rotation helps avoid blocking
- Check network connectivity

### Notification Timing Issues
- Verify timezone calculations (EST)
- Check date parsing for edge cases
- Ensure timeouts are cleared properly

### TypeScript Errors
- Enable strict mode for better type checking
- Use proper Discord.js types
- Avoid `any` types

---

_This file is automatically read when Claude starts a session in this repository._
