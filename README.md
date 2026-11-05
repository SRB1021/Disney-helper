# Disney Helper

Walt Disney World live wait times, Lightning Lane tracking, wait predictions and a day planner.
Node + Express, SQLite (`node:sqlite`), no build step. Data: [ThemeParks.wiki](https://themeparks.wiki).

## Run
```bash
npm install
npm start      # http://localhost:3000
npm test
```
Needs Node >= 22.13. The server polls every 5 minutes and stores snapshots in `DB_PATH`
(default `./data/history.db`); predictions appear after a few days of data.

## Deploy on Render
`render.yaml` defines a Node web service. The free plan has no persistent disk, so history is
lost on redeploy and the service sleeps when idle (so it only records while awake). For real
history use a paid plan with a disk at `/var/data` and set `DB_PATH=/var/data/history.db`.
Render deploys the branch set in the service (currently `main`).

## Status
The ThemeParks.wiki client (`src/themeparks.js`) follows the documented response shape but has
not yet been checked against live data.
