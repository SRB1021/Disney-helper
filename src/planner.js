// Greedy day planner: repeatedly ride whichever remaining must-do is cheapest
// right now (predicted/live wait + walk), respecting Lightning Lane windows.
//
// rides: [{ id, name, currentWait, predicted: {hour: minutes}, llStart?: minutesSinceMidnight,
//           durationMin? }]
// opts:  { startMin, endMin, walkMin }   (minutes since midnight, park-local)
const MAX_IDLE_FOR_LL = 20; // minutes we'll wait around for a Lightning Lane window

function waitAt(ride, min) {
  const hour = Math.floor(min / 60) % 24;
  const p = ride.predicted?.[hour];
  if (p != null) return p;
  return ride.currentWait ?? 30; // unknown: assume 30
}

function planDay(rides, { startMin = 540, endMin = 1260, walkMin = 10 } = {}) {
  const remaining = [...rides];
  const steps = [];
  const skipped = [];
  let t = startMin;
  let first = true;

  while (remaining.length) {
    let pick = null;
    for (const r of remaining) {
      const walk = first ? 0 : walkMin;
      const arrive = t + walk;
      // Lightning Lane: enter at the window start instead of queuing.
      const ll = r.llStart != null && r.llStart >= arrive;
      const start = ll ? r.llStart : arrive;
      const wait = ll ? 5 : waitAt(r, arrive);
      const end = start + wait + (r.durationMin ?? 5);
      // Don't sit idle for a far-off LL window: defer that ride (unless it's all that's left).
      const idle = ll ? start - arrive : 0;
      const deferred = idle > MAX_IDLE_FOR_LL && remaining.length > 1;
      const cost = deferred ? Infinity : ll ? idle * 0.5 + wait : end - t;
      if (!pick || cost < pick.cost) pick = { ride: r, ll, arrive, start, wait, end, cost };
    }
    remaining.splice(remaining.indexOf(pick.ride), 1);
    if (pick.end > endMin) { skipped.push(pick.ride.id); continue; }
    steps.push({
      rideId: pick.ride.id, name: pick.ride.name, usesLightningLane: pick.ll,
      arriveMin: pick.arrive, waitMin: pick.wait, startMin: pick.start, endMin: pick.end,
    });
    t = pick.end;
    first = false;
  }
  return { steps, skipped, finishMin: t };
}

module.exports = { planDay, waitAt };
