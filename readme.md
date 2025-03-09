# Economic Calendar Discord Bot `with-tariffs-wide-open`

This project is a Discord bot that scrapes economic calendar events from [MarketWatch](https://www.marketwatch.com/economy-politics/calendar) and displays them via a slash command in a mobile-friendly, multi-page grid embed. Events are grouped by date and only upcoming events are shown. A daily scheduler automatically updates the event data, and a fallback re-scrape is performed if no data is found when a command is used.

## Features

- **Daily Data Update:** Uses a cron job (via `node-cron`) to scrape and store events once a day.
- **Fallback Re-scrape:** If no stored data exists when the `/calendar` command is used, the bot will attempt to re-scrape the latest events.
- **Grouped Display:** Events are grouped by date so that repeated date headings are consolidated.
- **Mobile-Friendly Layout:** Uses Discord embed inline fields (instead of ASCII tables) to display event data in a grid-like, professional format.
- **Pagination:** Supports “Previous” and “Next” buttons for navigating multiple pages of events.
- **User-Agent Rotation:** The scraper rotates among a small set of realistic browser user agents to reduce the chance of being blocked.

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
4. **Build/Run the Bot**: You can run the bot using:
   ```bash
   npx ts-node src/index.ts
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

`src/scheduler.ts`:
(Optional) Contains a cron job to automatically update event data daily.

`src/notifier.ts`: Schedules and sends notifications for upcoming events.

`src/notifierMessage.ts`: Contains functions to build and send Discord embeds for notifications.

`src/commands/calendar.ts`:
Implements the /calendar command. This module groups events by date, builds multi-page embeds with inline fields, and sets up pagination buttons.

`src/models/event.ts`: Defines the Event interface.