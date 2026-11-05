// Saves a snapshot of every ride's wait/LL state on a timer so we can build history.
const TZ = 'America/New_York'; // Walt Disney World local time

function localParts(ts) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'short', hour: 'numeric', hour12: false,
  }).formatToParts(new Date(ts));
  const get = (t) => parts.find((p) => p.type === t).value;
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { dow, hour: Number(get('hour')) % 24 };
}

function startPoller({ db, api, intervalMs = 5 * 60_000, log = console }) {
  async function tick() {
    try {
      const parks = await api.getParks();
      const ts = Date.now();
      const { dow, hour } = localParts(ts);
      for (const park of parks) {
        for (const r of await api.getLive(park.id)) {
          if (r.status !== 'OPERATING' && r.status !== 'DOWN') continue; // skip closed rides
          db.saveSnapshot({
            rideId: r.id, parkId: park.id, ts, dow, hour, status: r.status,
            standby: r.standby, llState: (r.llSingle || r.llMulti)?.state,
            llStart: (r.llSingle || r.llMulti)?.start, llPrice: r.llSingle?.price,
          });
        }
      }
    } catch (err) {
      log.error('poll failed:', err.message);
    }
  }
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return { stop: () => clearInterval(timer), tick };
}

module.exports = { startPoller, localParts, TZ };
