// SQLite via Node's built-in node:sqlite (no native build needed on Render).
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function openDb(file = process.env.DB_PATH || './data/history.db') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      ride_id TEXT NOT NULL,
      park_id TEXT NOT NULL,
      ts INTEGER NOT NULL,          -- unix ms
      dow INTEGER NOT NULL,         -- 0-6, park-local
      hour INTEGER NOT NULL,        -- 0-23, park-local
      status TEXT,
      standby INTEGER,              -- minutes, null if closed
      ll_state TEXT,                -- AVAILABLE / FINISHED / null
      ll_start TEXT,                -- next LL return start (ISO)
      ll_price REAL
    );
    CREATE INDEX IF NOT EXISTS idx_ride_ts ON snapshots (ride_id, ts);
    CREATE INDEX IF NOT EXISTS idx_ride_dow_hour ON snapshots (ride_id, dow, hour);
  `);
  const insert = db.prepare(`INSERT INTO snapshots
    (ride_id, park_id, ts, dow, hour, status, standby, ll_state, ll_start, ll_price)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  return {
    saveSnapshot(r) {
      insert.run(r.rideId, r.parkId, r.ts, r.dow, r.hour, r.status ?? null,
        r.standby ?? null, r.llState ?? null, r.llStart ?? null, r.llPrice ?? null);
    },
    history(rideId, sinceTs) {
      return db.prepare(`SELECT ts, status, standby, ll_state, ll_start, ll_price
        FROM snapshots WHERE ride_id = ? AND ts >= ? ORDER BY ts`).all(rideId, sinceTs);
    },
    samplesByHour(rideId) {
      return db.prepare(`SELECT dow, hour, standby FROM snapshots
        WHERE ride_id = ? AND standby IS NOT NULL`).all(rideId);
    },
    count() { return db.prepare('SELECT COUNT(*) AS n FROM snapshots').get().n; },
    close() { db.close(); },
  };
}

module.exports = { openDb };
