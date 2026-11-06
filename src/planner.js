// Greedy day planner: repeatedly ride whichever remaining must-do is cheapest
// right now (predicted/live wait + walk), respecting Lightning Lane windows and
// fixed-time events (meal breaks, shows).
//
// rides:  [{ id, name, currentWait, predicted: {hour: minutes}, llStart?: minutesSinceMidnight, durationMin? }]
// opts:   { startMin, endMin, walkMin, events: [{ name, startMin, durMin }] }
const MAX_IDLE_FOR_LL = 20; // minutes we'll wait around for a Lightning Lane window

function waitAt(ride, min) {
  const hour = Math.floor(min / 60) % 24;
  const p = ride.predicted?.[hour];
  if (p != null) return p;
  return ride.currentWait ?? 30; // unknown: assume 30
}

function planDay(rides, { startMin = 540, endMin = 1260, walkMin = 10, events = [] } = {}) {
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
      if (!pick || cost < pick.cost) pick = { ride: r, ll, arrive: shownArrive, start, wait, end, cost };
    }
    if (!pick) { doEvent(pending.shift()); continue; } // nothing fits before the event: go to it

    remaining.splice(remaining.indexOf(pick.ride), 1);
    if (pick.end > endMin) { skipped.push(pick.ride.id); continue; }
    steps.push({
      kind: 'ride', rideId: pick.ride.id, name: pick.ride.name, usesLightningLane: pick.ll,
      arriveMin: pick.arrive, waitMin: pick.wait, startMin: pick.start, endMin: pick.end,
    });
    t = pick.end;
    first = false;
  }
  return { steps, skipped, finishMin: t };
}

module.exports = { planDay, waitAt };
