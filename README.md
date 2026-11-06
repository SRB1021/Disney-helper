# Disney Helper

Walt Disney World live wait times, Lightning Lane tracking, wait predictions and a day planner.
Node + Express, SQLite (`node:sqlite`), no build step. Data: [ThemeParks.wiki](https://themeparks.wiki) (rides, shows, hours) and [Open-Meteo](https://open-meteo.com) (weather); both free, no keys.

## Features
Live waits with gray unavailable rides, favorites, search/filters and wait alerts · crowd level and park hours ·
typical-wait-by-hour chart (fills in as history is collected) · map with your location, a suggested next ride and your
plan's route · day planner that orders stops by walking distance (exact shortest route for up to 12 rides) with meal break and pinned shows · shows tab · 3-day weather with rain tips ·
quick park chooser (tap, or press 1-6).

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
The ThemeParks.wiki client (`src/themeparks.js`) has been checked against live data (parks, waits, Lightning Lane).
