# Neelam Dandiya Career Quiz — 10 October 2026

Offline-first event quiz for Neelam Group of Institutions, Agra, with SQLite-backed registration storage.

- 6 career streams.
- 50 questions in each stream (300 total).
- Random 3 questions per participant.
- Any wrong answer ends the game.
- 3/3 correct = winner.
- Student/Parent registration, course interest and phone number.
- Offline browser queue that syncs registrations and scores to SQLite.
- CSV export.
- Optional Google Sheets copy.

## Run with SQLite

Install Node.js 20.19 or newer, then run these commands from the project folder:

```powershell
npm install
npm start
```

Open `http://localhost:3000`. Other devices on the same trusted event network can use the `Network` URL printed by the server. Keep the server on a trusted local network; do not expose it directly to the public internet.

SQLite is stored in this project folder as `leads.sqlite`. On the next server start, existing records from the previous home-folder database are imported once and retained. Set `SQLITE_PATH` to choose another database file, or `PORT` to change the server port.

Registrations are queued in the browser and sent to SQLite when connected. Final scores and results update the same database record. Pending records automatically sync when connectivity returns.

## Offline-only use

Opening `index.html` directly still runs the quiz and queues records in that browser, but a static file cannot write to SQLite. Use the Node.js server URL whenever SQLite persistence is required.

## Google Sheets copy

Set `GOOGLE_SCRIPT_URL` in `app.js` to also send synced records to a Google Apps Script Web App. SQLite remains the primary local database.

Test the app offline before the event and keep CSV export as a backup. Obtain appropriate participant consent before collecting contact details.
