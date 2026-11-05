// Client for the free ThemeParks.wiki API (https://api.themeparks.wiki/docs).
// NOTE: written against the documented response shape; verify against live data.
const BASE = 'https://api.themeparks.wiki/v1';
const TTL_MS = 60_000;
const cache = new Map();

async function getJson(path, ttl = TTL_MS) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  const res = await fetch(BASE + path, { headers: { 'user-agent': 'disney-helper/0.1' } });
  if (!res.ok) throw new Error(`ThemeParks.wiki ${path} -> ${res.status}`);
  const data = await res.json();
  cache.set(path, { at: Date.now(), data });
  return data;
}

// Walt Disney World's four parks, resolved by name so we don't hardcode IDs.
async function getParks() {
  const { destinations } = await getJson('/destinations', 6 * 3600_000);
  const wdw = destinations.find((d) => /walt disney world/i.test(d.name));
  if (!wdw) throw new Error('Walt Disney World not found in destinations');
  return wdw.parks.map((p) => ({ id: p.id, name: p.name }));
}

// Normalize one live entry into the shape the app uses.
function normalize(e) {
  const q = e.queue || {};
  const paid = q.PAID_RETURN_TIME;
  const ret = q.RETURN_TIME;
  return {
    id: e.id,
    name: e.name,
    status: e.status,                                   // OPERATING / DOWN / CLOSED / REFURBISHMENT
    standby: q.STANDBY?.waitTime ?? null,
    llSingle: paid ? {                                  // paid Lightning Lane (Single Pass / Premier)
      state: paid.state, start: paid.returnStart ?? null,
      end: paid.returnEnd ?? null, price: paid.price?.amount != null ? paid.price.amount / 100 : null,
    } : null,
    llMulti: ret ? { state: ret.state, start: ret.returnStart ?? null, end: ret.returnEnd ?? null } : null,
    lastUpdated: e.lastUpdated ?? null,
  };
}

async function getLive(parkId) {
  const data = await getJson(`/entity/${parkId}/live`);
  return (data.liveData || []).filter((e) => e.entityType === 'ATTRACTION').map(normalize);
}

async function getSchedule(parkId) {
  const data = await getJson(`/entity/${parkId}/schedule`, 15 * 60_000);
  return data.schedule || [];
}

module.exports = { getParks, getLive, getSchedule, normalize };
