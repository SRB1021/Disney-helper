const path = require('node:path');
const express = require('express');
const api = require('./src/themeparks');
const { openDb } = require('./src/db');
const { startPoller, localParts } = require('./src/poller');
const { typicalByHour, bestHour } = require('./src/predict');
const { planDay } = require('./src/planner');

function createApp({ db, api }) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  const wrap = (fn) => (req, res) => fn(req, res).catch((e) => res.status(502).json({ error: e.message }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, snapshots: db.count() }));

  app.get('/api/parks', wrap(async (_req, res) => res.json(await api.getParks())));

  // Live list. Adds a "trend" vs. ~30 minutes ago when history exists.
  app.get('/api/parks/:id/live', wrap(async (req, res) => {
    const rides = await api.getLive(req.params.id);
    const since = Date.now() - 35 * 60_000;
    for (const r of rides) {
      const past = db.history(r.id, since)[0];
      r.trend = past && past.standby != null && r.standby != null ? r.standby - past.standby : null;
    }
    res.json(rides);
  }));

  app.get('/api/rides/:id/history', (req, res) => {
    const hours = Math.min(Number(req.query.hours) || 24, 24 * 14);
    res.json(db.history(req.params.id, Date.now() - hours * 3600_000));
  });

  app.get('/api/rides/:id/predict', (req, res) => {
    const { dow } = localParts(Date.now());
    const typical = typicalByHour(db.samplesByHour(req.params.id), dow);
    res.json({ ...typical, best: bestHour(typical.hours), ready: Object.keys(typical.hours).length > 0 });
  });

  app.post('/api/plan', wrap(async (req, res) => {
    const { parkId, mustDos = [], startMin, endMin, walkMin } = req.body || {};
    if (!parkId || !Array.isArray(mustDos) || !mustDos.length) {
      return res.status(400).json({ error: 'parkId and a non-empty mustDos[] are required' });
    }
    const live = await api.getLive(parkId);
    const rides = mustDos.map((id) => live.find((r) => r.id === id)).filter(Boolean).map((r) => {
      const { hours } = typicalByHour(db.samplesByHour(r.id), localParts(Date.now()).dow);
      const ll = r.llSingle?.state === 'AVAILABLE' ? r.llSingle : r.llMulti?.state === 'AVAILABLE' ? r.llMulti : null;
      return {
        id: r.id, name: r.name, currentWait: r.standby,
        predicted: Object.fromEntries(Object.entries(hours).map(([h, v]) => [h, v.median])),
        llStart: ll?.start ? isoToLocalMinutes(ll.start) : undefined,
      };
    });
    res.json(planDay(rides, { startMin, endMin, walkMin }));
  }));

  return app;
}

function isoToLocalMinutes(iso) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(new Date(iso));
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  return (g('hour') % 24) * 60 + g('minute');
}

if (require.main === module) {
  const db = openDb();
  const app = createApp({ db, api });
  startPoller({ db, api });
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Disney Helper on :${port}`));
}

module.exports = { createApp };
