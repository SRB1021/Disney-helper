// Greedy day planner: repeatedly ride whichever remaining must-do is cheapest
// right now (predicted/live wait + walk), respecting Lightning Lane windows and
// fixed-time events (meal breaks, shows).
//
// rides:  [{ id, name, currentWait, predicted: {hour: minutes}, llStart?: minutesSinceMidnight, durationMin? }]
// opts:   { startMin, endMin, walkMin, events: [{ name, startMin, durMin }] }
const MAX_IDLE_FOR_LL = 20; // minutes we'll wait around for a Lightning Lane window
const LONG_WAIT = 40;       // standby line long enough to be worth coming back for a far-off LL window

function waitAt(ride, min) {
  const hour = Math.floor(min / 60) % 24;
  const p = ride.predicted?.[hour];
  if (p != null) return p;
  return ride.currentWait ?? 30; // unknown: assume 30
}

function planLegacy(rides, { startMin = 540, endMin = 1260, walkMin = 10, events = [] } = {}) {
  const remaining = [...rides];
  const pending = events.filter((e) => e.startMin < endMin).sort((a, b) => a.startMin - b.startMin);
  const steps = [];
  const skipped = [];
  let t = startMin;
  let first = true;

  const doEvent = (e) => {
    const arrive = t + (first ? 0 : walkMin);
    const start = Math.max(e.startMin, arrive);
    steps.push({
      kind: 'event', name: e.name, arriveMin: arrive, startMin: start, endMin: start + e.durMin,
      late: start > e.startMin,
    });
    t = start + e.durMin;
    first = false;
  };

  while (remaining.length || pending.length) {
    const ev = pending[0];
    if (!remaining.length) { doEvent(pending.shift()); continue; }

    let pick = null;
    for (const r of remaining) {
      const walk = first ? 0 : walkMin;
      const arrive = t + walk;
      // Lightning Lane: enter at the window start instead of queuing.
      const ll = r.llStart != null && r.llStart >= arrive;
      const start = ll ? r.llStart : arrive;
      const wait = ll ? 5 : waitAt(r, arrive);
      const end = start + wait + (r.durationMin ?? 5);
      if (ev && end + walkMin > ev.startMin) continue; // wouldn't finish in time for the next event
      // Don't sit idle for a far-off LL window: defer that ride (unless it's all that's left).
      const idle = ll ? start - arrive : 0;
      const deferred = idle > MAX_IDLE_FOR_LL && remaining.length > 1;
      // Deferred LL rides sort after normal ones, earliest window first.
      const cost = deferred ? 1e6 + start : ll ? idle * 0.5 + wait : end - t;
      // For a far-off window, you come back at the window start (don't show an early "arrive").
      const shownArrive = ll && idle > MAX_IDLE_FOR_LL ? start : arrive;
      // What the same ride would cost in the standby line, arriving right now-ish.
      const altWait = waitAt(r, arrive);
      const altEnd = arrive + altWait + (r.durationMin ?? 5);
      if (!pick || cost < pick.cost) pick = { ride: r, ll, arrive: shownArrive, start, wait, end, cost, altWait, altEnd };
    }
    if (!pick) { doEvent(pending.shift()); continue; } // nothing fits before the event: go to it

    remaining.splice(remaining.indexOf(pick.ride), 1);
    if (pick.end > endMin) { skipped.push(pick.ride.id); continue; }
    steps.push({
      kind: 'ride', rideId: pick.ride.id, name: pick.ride.name, usesLightningLane: pick.ll,
      arriveMin: pick.arrive, waitMin: pick.wait, rideMin: pick.ride.durationMin ?? 5, startMin: pick.start, endMin: pick.end,
      ...(pick.ll ? { altWaitMin: pick.altWait, altEndMin: pick.altEnd } : {}),
    });
    t = pick.end;
    first = false;
  }
  return { steps, skipped, finishMin: t };
}

// ---------- proximity-based planner (used when every ride has coordinates) ----------
const DEFAULT_PACE = 80; // meters per minute (~3 mph)

function distM(a, b) {
  const R = 6371000, rad = (d) => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const walkTime = (a, b, pace) => Math.max(1, Math.round(distM(a, b) / pace));

function pathLength(order, start) {
  let d = 0, prev = start || null;
  for (const r of order) { if (prev) d += distM(prev, r); prev = r; }
  return d;
}

// Nearest-neighbour path, then 2-opt to remove zig-zags (open path). Without a start point,
// try every ride as the head and keep the shortest.
function nearestPath(rides, start, head) {
  const left = [...rides], order = [];
  let cur = start || null;
  if (!start && head) { order.push(left.splice(left.indexOf(head), 1)[0]); cur = order[0]; }
  while (left.length) {
    let bi = 0, bd = Infinity;
    left.forEach((r, i) => { const d = cur ? distM(cur, r) : 0; if (d < bd) { bd = d; bi = i; } });
    cur = left.splice(bi, 1)[0]; order.push(cur);
  }
  return order;
}
function twoOpt(order, start) {
  let best = pathLength(order, start), improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const cand = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        const d = pathLength(cand, start);
        if (d < best - 1) { best = d; order = cand; improved = true; }
      }
    }
  }
  return order;
}
// Exact shortest open path (Held-Karp dynamic programming). Fine for up to ~12 stops.
function exactPath(rides, start) {
  const n = rides.length;
  const d = rides.map((a) => rides.map((b) => distM(a, b)));
  const d0 = rides.map((r) => (start ? distM(start, r) : 0));
  const size = 1 << n, INF = Infinity;
  const dp = Array.from({ length: size }, () => new Float64Array(n).fill(INF));
  const prev = Array.from({ length: size }, () => new Int8Array(n).fill(-1));
  for (let j = 0; j < n; j++) dp[1 << j][j] = d0[j];
  for (let mask = 1; mask < size; mask++) {
    for (let j = 0; j < n; j++) {
      const cur = dp[mask][j];
      if (cur === INF || !(mask & (1 << j))) continue;
      for (let k = 0; k < n; k++) {
        if (mask & (1 << k)) continue;
        const nm = mask | (1 << k), v = cur + d[j][k];
        if (v < dp[nm][k]) { dp[nm][k] = v; prev[nm][k] = j; }
      }
    }
  }
  let last = 0, best = INF;
  for (let j = 0; j < n; j++) if (dp[size - 1][j] < best) { best = dp[size - 1][j]; last = j; }
  const order = [];
  for (let mask = size - 1, j = last; j !== -1; ) { order.push(rides[j]); const pj = prev[mask][j]; mask ^= 1 << j; j = pj; }
  return order.reverse();
}

function orderByProximity(rides, start) {
  if (rides.length <= 12) return rides.length < 2 ? [...rides] : exactPath(rides, start);
  const heads = start ? [null] : rides;
  let bestOrder = null, bestLen = Infinity;
  for (const h of heads) {
    const o = twoOpt(nearestPath(rides, start, h), start);
    const len = pathLength(o, start);
    if (len < bestLen) { bestLen = len; bestOrder = o; }
  }
  return bestOrder;
}

function planGeo(rides, { startMin = 540, endMin = 1260, walkMin = 10, events = [], start = null, pace = DEFAULT_PACE } = {}) {
  const remaining = orderByProximity(rides, start);
  const pending = events.filter((e) => e.startMin < endMin).sort((a, b) => a.startMin - b.startMin);
  const steps = [], skipped = [];
  let t = startMin, pos = start, first = true, totalWalkM = 0, totalWalkMin = 0;

  const doEvent = (e) => {
    const walk = first ? 0 : Math.min(walkMin, 5);   // venue location unknown: short flat walk
    const arrive = t + walk, begin = Math.max(e.startMin, arrive);
    steps.push({ kind: 'event', name: e.name, arriveMin: arrive, startMin: begin, endMin: begin + e.durMin, late: begin > e.startMin });
    t = begin + e.durMin; first = false;
  };

  while (remaining.length || pending.length) {
    const ev = pending[0];
    if (!remaining.length) { doEvent(pending.shift()); continue; }

    let pick = null, deferredBest = null;
    for (const r of remaining) {                      // remaining is in proximity order: take the first that fits
      const walkM = pos ? distM(pos, r) : 0;
      const walk = pos ? walkTime(pos, r, pace) : 0;
      const arrive = t + walk;
      const altWait = waitAt(r, arrive);
      const llOpen = r.llStart != null && r.llStart >= arrive;
      const llIdle = llOpen ? r.llStart - arrive : 0;
      // Use Lightning Lane when its window is about to open, or when the standby line is long and the
      // window is far off (come back later). Otherwise just ride in walking order.
      const farButWorthIt = llIdle > MAX_IDLE_FOR_LL && altWait >= LONG_WAIT;
      const ll = llOpen && (llIdle <= MAX_IDLE_FOR_LL || farButWorthIt);
      const begin = ll ? r.llStart : arrive;
      const wait = ll ? 5 : altWait;
      const end = begin + wait + (r.durationMin ?? 5);
      if (ev && end + 5 > ev.startMin) continue;      // wouldn't finish before the next fixed event
      const idle = ll ? begin - arrive : 0;
      const cand = { ride: r, ll, arrive: ll && idle > MAX_IDLE_FOR_LL ? begin : arrive, begin, wait, end, walk, walkM,
        altWait, altEnd: arrive + altWait + (r.durationMin ?? 5) };
      if (idle > MAX_IDLE_FOR_LL && remaining.length > 1) {   // don't sit around for a far-off LL window
        if (!deferredBest || begin < deferredBest.begin) deferredBest = cand;
        continue;
      }
      pick = cand; break;
    }
    if (!pick) pick = deferredBest;
    if (!pick) { doEvent(pending.shift()); continue; }

    remaining.splice(remaining.indexOf(pick.ride), 1);
    if (pick.end > endMin) { skipped.push(pick.ride.id); continue; }
    steps.push({
      kind: 'ride', rideId: pick.ride.id, name: pick.ride.name, usesLightningLane: pick.ll,
      arriveMin: pick.arrive, waitMin: pick.wait, rideMin: pick.ride.durationMin ?? 5, startMin: pick.begin, endMin: pick.end,
      walkMin: pick.walk, walkM: Math.round(pick.walkM),
      ...(pick.ll ? { altWaitMin: pick.altWait, altEndMin: pick.altEnd } : {}),
    });
    totalWalkM += pick.walkM; totalWalkMin += pick.walk;
    t = pick.end; pos = pick.ride; first = false;
  }
  return { steps, skipped, finishMin: t, totalWalkM: Math.round(totalWalkM), totalWalkMin, mode: 'proximity' };
}

function planDay(rides, opts = {}) {
  const geo = rides.length > 0 && rides.every((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  return geo ? planGeo(rides, opts) : planLegacy(rides, opts);
}

module.exports = { planDay, waitAt, distM, pathLength, orderByProximity, DEFAULT_PACE };
