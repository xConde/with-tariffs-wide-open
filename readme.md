# Economic Calendar Discord Bot `with-tariffs-wide-open`

This project is a Discord bot that scrapes economic calendar events from [MarketWatch](https://www.marketwatch.com/economy-politics/calendar) and displays them via a slash command in a mobile-friendly, multi-page embed. Events are grouped by date and only upcoming events are shown. A daily scheduler automatically updates the event data, and a fallback re-scrape is performed if no data is found when a command is used.

## Features

- **Daily Data Update:** A cron job (via `node-cron`) scrapes and stores events once a day.
- **Fallback Re-scrape:** If no stored data exists when the `/calendar` command is invoked, the bot will re-scrape the latest events.
- **Grouped & Paginated Display:** Events are grouped by date so that repeated date headings are consolidated. The bot displays the events in multi-page embeds with “Previous” and “Next” buttons for easy navigation.
- **Responsive Notification Updates:** The bot sends scheduled notifications 30 minutes and 1 minute before events. The 1-minute alert is updated after the event starts, pulling updated data (including actual values) and displaying performance indicators (e.g., “↑ Higher” or “↓ Lower”).
- **User-Agent Rotation:** The scraper rotates among a pool of realistic browser user agents to reduce the risk of being blocked.
- **Fake Date Support for Testing:** You can simulate a different current date by setting the `FAKE_DATE` environment variable.
- **Optimized & Modularized Code:** Refactored for long-term stability and maintainability, with clear separation of concerns across modules.


[![Watch the video](https://img.youtube.com/vi/MVBy7bKlqaU/maxresdefault.jpg)](https://www.youtube.com/watch?v=MVBy7bKlqaU)


## Technologies Used

- [Node.js](https://nodejs.org/)
- [discord.js v14](https://discord.js.org/)
- [axios](https://axios-http.com/)
- [cheerio](https://cheerio.js.org/)
- [node-cron](https://www.npmjs.com/package/node-cron)
- [TypeScript](https://www.typescriptlang.org/)
- [ts-node](https://www.npmjs.com/package/ts-node)
- [dotenv](https://www.npmjs.com/package/dotenv)
- [date-fns](https://date-fns.org/) & [date-fns-tz](https://github.com/marnusw/date-fns-tz)

## Setup & Installation

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/yourusername/your-repo-name.git
   cd your-repo-name
2. **Install Dependencies**:
   ```bash
   npm install
3. **Create a `.env` File**:

    In the project root, create a file named .env and add the following (replace placeholder values with your actual Discord credentials):
   ```bash
      DISCORD_TOKEN=your_discord_bot_token
      DISCORD_CHANNEL_ID=your_discord_channel_id
      CLIENT_ID=your_client_id
      # Optional: Set a fake date for testing (in ISO 8601 format, EST-based)
      FAKE_DATE=2025-03-17T07:28:58.000Z
      # Optional: Set RESCRAPE=1 to manually force a data update on startup
      RESCRAPE=0
4. **Build/Run the Bot**: You can run the bot using:
   ```bash
   npm run start
   ```
   The bot will log in to Discord, start the daily scheduler, and listen for slash command interactions.

# Usage
## `/calendar` Command

When you type /calendar in your Discord server, the bot loads stored event data (or re-scrapes if missing), filters out past events, groups events by date, and displays them in a multi-page embed.

Users can navigate between pages using “Previous page” and “Next page” buttons.

----
## Project Structure
`src/index.ts`:
The main entry point that initializes the Discord bot and starts the scheduler.

`src/discordBot.ts`:
Sets up the Discord client, listens for slash command and button interactions, and logs in the bot.

`src/scraper.ts`:
Contains the scraper logic (using axios and cheerio) with rotating user agents to fetch economic calendar data from MarketWatch.

`src/storage.ts`:
Provides functions for reading from and writing to the local JSON file where scraped event data is stored.

`src/scheduler.ts`: Contains the cron job for daily event updates.

`src/notifier.ts`: Schedules and sends notifications for upcoming events.

`src/globalSetup.ts`: Handles global initialization tasks (e.g., setting fake dates, validating environment variables, and handling unhandled rejections).

`src/commands/calendar.ts`:
Implements the /calendar command. This module groups events by date, builds multi-page embeds with inline fields, and sets up pagination buttons.

`src/events/notifierMessage.ts`: Contains functions to build and send Discord embeds for notifications.

`src/models/event.ts`: Defines the `CalendarEvent` interface.
