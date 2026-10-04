# Family Calendar

A wall calendar for a touchscreen. A small Node server runs on the home lab, and the Raspberry Pi just opens its address full screen in Kiosk OS.

It shows each person's Google Calendar in their own color, with photo buttons to show or hide each person. The grid starts on Sunday and shows three weeks, and you can scroll for more. It also has a "today" strip, the weather for each day, a school lunch button, and optional dinner and countdown cards.

## Run it

You need [Node.js](https://nodejs.org) 22 or newer.

```sh
npm install
npm start
```

Then open `http://<this-computer's-ip>:8080` on the Pi, or `http://localhost:8080` on the same computer. Until `config/family.json` exists it shows a sample family, so you can try it right away. `npm run demo` shows the sample family even after you've set up your own.

To keep it running after you close the terminal, use a process manager like `pm2` (`npx pm2 start server/index.js --name family-calendar`), or switch to Docker (below) when you're ready.

## Set it up for real

1. **Get each calendar's private address.** In Google Calendar on a computer, open Settings, pick the calendar on the left, and copy **Secret address in iCal format** from "Integrate calendar". Do this for each person's calendar (the dog's too).
   That field only appears on calendars the account owns or can "make changes and manage sharing" on. If a family member owns their calendar, either copy it while signed in as them, or give the shared account that permission.
   Treat these addresses like passwords. Anyone with one can read that calendar.
2. **Write the settings file.** Copy `config/family.example.json` to `config/family.json` and fill in names, colors and the iCal addresses.
   - `photo` is a file name inside `config/photos/` (a square JPG around 300px works well). Leave it out to show an initial instead.
   - `dog: true` shows a paw when there's no photo.
   - `sharedCalendars` is for a calendar that belongs to several people, e.g. `{ "name": "Family", "ical": "...", "people": ["chris", "jamie", "ava", "leo"] }`.
   - `meals.ical` is optional: one event per day on a "Meals" calendar shows as "Dinner tonight".
   - `countdowns` repeat every year unless `"yearly": false`.
3. **Restart it** (`npm start` again). The terminal should print a line like `5 people, 5 calendars`.
4. **Point the Pi at it.** Set the Kiosk OS start page to `http://<home-lab-ip>:8080`.

Changing `family.json` or photos needs a restart.

## Docker (later)

The repo also has a `Dockerfile` and `docker-compose.yml`. From the project folder run `docker compose up -d --build`. It mounts `./config` into the container, so the same `family.json` and photos work. Check `docker logs family-calendar` if something looks wrong.

## How it works

- `server/` is a small Node server with no framework. It fetches the calendars every few minutes, weather every 15 minutes (Open-Meteo, no key needed) and lunch hourly (Nutrislice). It caches everything and keeps serving the last good copy if the internet drops. The screen shows a small "offline" tag when that happens.
- Events are split into days on the server, in the `timezone` from `family.json`. An invite that's on two people's calendars shows once, with both colors.
- `public/` is the screen, in plain JavaScript and CSS with no build step, kept light for the Pi 3. It scales to the screen size and also works in portrait.
- On the screen: tap a photo to hide or show that person (the Pi remembers). Tap a day for details, and tap the yellow button for the lunch menu. After 90 seconds with no touch it closes any open panel and scrolls back to this week. It reloads itself at 3:30am each night.

## Known gaps

- **School lunch is unverified.** The Nutrislice feed address and format are inferred from how its menu site works, and haven't been checked against the live site yet. If the lunch button doesn't appear and the screen says "Lunch menu offline", check the server's output for the error.
- **Fonts load from Google Fonts.** Without internet the screen falls back to the Pi's built-in sans-serif.

## Tests

```sh
npm test
```
