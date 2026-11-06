const test = require('node:test');
const assert = require('node:assert');
const { planDay } = require('../src/planner');

test('rides the shortest wait first and sums the timeline', () => {
  const rides = [
    { id: 'a', name: 'A', currentWait: 60 },
    { id: 'b', name: 'B', currentWait: 10 },
  ];
  const plan = planDay(rides, { startMin: 540, endMin: 1260, walkMin: 10 });
  assert.equal(plan.steps[0].rideId, 'b');
  assert.equal(plan.steps[0].startMin, 540);
  assert.equal(plan.steps[0].endMin, 555); // 10 wait + 5 ride
  assert.equal(plan.steps[1].arriveMin, 565); // + 10 walk
});

test('uses predicted wait for the arrival hour', () => {
  const rides = [{ id: 'a', name: 'A', currentWait: 90, predicted: { 9: 15 } }];
  assert.equal(planDay(rides, { startMin: 540 }).steps[0].waitMin, 15);
});

test('uses a Lightning Lane window when it is still ahead', () => {
  const rides = [{ id: 'a', name: 'A', currentWait: 80, llStart: 600 }];
  const s = planDay(rides, { startMin: 540 }).steps[0];
  assert.equal(s.usesLightningLane, true);
  assert.equal(s.startMin, 600);
  assert.equal(s.waitMin, 5);
});

test('skips rides that would run past park close', () => {
  const rides = [{ id: 'a', name: 'A', currentWait: 120 }];
  const plan = planDay(rides, { startMin: 540, endMin: 600 });
  assert.deepEqual(plan.skipped, ['a']);
  assert.equal(plan.steps.length, 0);
});

test('does not idle for a far-off Lightning Lane window while other rides are available', () => {
  const rides = [
    { id: 'll', name: 'LL', currentWait: 80, llStart: 900 },
    { id: 'b', name: 'B', currentWait: 10 },
  ];
  const plan = planDay(rides, { startMin: 540, walkMin: 10 });
  assert.equal(plan.steps[0].rideId, 'b');
  assert.equal(plan.steps[1].rideId, 'll');
  assert.equal(plan.steps[1].startMin, 900);
});

test('inserts a meal break at its fixed time and plans around it', () => {
  const rides = ['a', 'b', 'c'].map((id) => ({ id, name: id, currentWait: 10 }));
  const plan = planDay(rides, { startMin: 660, endMin: 1260, walkMin: 10, events: [{ name: 'Lunch', startMin: 720, durMin: 45 }] });
  assert.deepEqual(plan.steps.map((s) => s.kind), ['ride', 'ride', 'event', 'ride']);
  const lunch = plan.steps[2];
  assert.equal(lunch.startMin, 720);
  assert.equal(lunch.endMin, 765);
  assert.equal(plan.steps[3].arriveMin, 775); // 10 min walk after lunch
});

test('events with no rides left are still scheduled', () => {
  const plan = planDay([{ id: 'a', name: 'A', currentWait: 5 }], { startMin: 540, events: [{ name: 'Show', startMin: 900, durMin: 30 }] });
  assert.equal(plan.steps.at(-1).kind, 'event');
  assert.equal(plan.steps.at(-1).startMin, 900);
});

test('far-off Lightning Lane rides are ordered by window and show the window time as arrival', () => {
  const rides = [
    { id: 'late', name: 'Late', currentWait: 15, llStart: 1275 },
    { id: 'early', name: 'Early', currentWait: 5, llStart: 1210 },
  ];
  const plan = planDay(rides, { startMin: 780, endMin: 1320, walkMin: 10 });
  assert.deepEqual(plan.steps.map((s) => s.rideId), ['early', 'late']);
  assert.equal(plan.steps[0].arriveMin, 1210);
  assert.equal(plan.steps[0].usesLightningLane, true);
});

test('Lightning Lane steps also report the standby alternative', () => {
  const rides = [{ id: 'a', name: 'A', currentWait: 45, llStart: 560, durationMin: 5 }];
  const s = planDay(rides, { startMin: 540 }).steps[0];
  assert.equal(s.usesLightningLane, true);
  assert.equal(s.waitMin, 5);
  assert.equal(s.altWaitMin, 45);
  assert.equal(s.altEndMin, 540 + 45 + 5);
  const plain = planDay([{ id: 'b', name: 'B', currentWait: 10 }], { startMin: 540 }).steps[0];
  assert.equal(plain.altWaitMin, undefined);
});

// ---- proximity planner ----
const M = 1 / 111195; // degrees of latitude per meter
const at = (id, meters, extra = {}) => ({ id, name: id, currentWait: 10, lat: 28 + meters * M, lng: -81, ...extra });

test('orders stops by distance, not by shortest wait', () => {
  const rides = [at('far', 2000, { currentWait: 5 }), at('near', 100, { currentWait: 90 })];
  const plan = planDay(rides, { startMin: 540, start: { lat: 28, lng: -81 } });
  assert.deepEqual(plan.steps.map((s) => s.rideId), ['near', 'far']);
  assert.equal(plan.mode, 'proximity');
});

test('removes zig-zags: visits rides along a line in order', () => {
  const rides = [at('c', 3000), at('a', 0), at('d', 1000), at('b', 2000)];
  const plan = planDay(rides, { startMin: 540, start: { lat: 28, lng: -81 } });
  assert.deepEqual(plan.steps.map((s) => s.rideId), ['a', 'd', 'b', 'c']);
  assert.ok(Math.abs(plan.totalWalkM - 3000) < 60, `walked ${plan.totalWalkM}`);
});

test('walking time comes from distance and pace', () => {
  const rides = [at('a', 800)];
  const slow = planDay(rides, { startMin: 540, start: { lat: 28, lng: -81 }, pace: 40 }).steps[0];
  const fast = planDay(rides, { startMin: 540, start: { lat: 28, lng: -81 }, pace: 80 }).steps[0];
  assert.equal(slow.walkMin, 20);
  assert.equal(fast.walkMin, 10);
  assert.equal(fast.arriveMin, 550);
});

test('without a start point it still picks the shortest overall path', () => {
  const rides = [at('b', 1000), at('c', 2000), at('a', 0)];
  const plan = planDay(rides, { startMin: 540 });
  const ids = plan.steps.map((s) => s.rideId);
  assert.ok(ids.join() === 'a,b,c' || ids.join() === 'c,b,a', ids.join());
});

test('proximity plan still honors a meal break', () => {
  const rides = [at('a', 0), at('b', 200), at('c', 400)];
  const plan = planDay(rides, { startMin: 700, start: { lat: 28, lng: -81 }, events: [{ name: 'Lunch', startMin: 720, durMin: 45 }] });
  assert.ok(plan.steps.some((s) => s.kind === 'event' && s.startMin === 720));
});

test('proximity order is the true shortest route (matches brute force)', () => {
  const { orderByProximity, pathLength } = require('../src/planner');
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rides = Array.from({ length: 6 }, (_, i) => ({ id: 'r' + i, lat: 28 + rnd() * 0.01, lng: -81 + rnd() * 0.01 }));
  const start = { lat: 28.005, lng: -80.995 };
  const perms = (a) => a.length < 2 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
  const best = Math.min(...perms(rides).map((p) => pathLength(p, start)));
  assert.ok(Math.abs(pathLength(orderByProximity(rides, start), start) - best) < 0.5);
});

test('big lists (over 12 stops) still get a sensible route quickly', () => {
  const rides = Array.from({ length: 20 }, (_, i) => at('r' + i, i * 150));
  const t0 = Date.now();
  const plan = planDay(rides, { startMin: 540, start: { lat: 28, lng: -81 } });
  assert.ok(Date.now() - t0 < 3000);
  assert.ok(plan.totalWalkM < 3100); // ~3000 m straight line
});

test('a far-off Lightning Lane window does not pull a short-wait ride out of walking order', () => {
  const rides = [at('a', 0), at('b', 200, { currentWait: 5, llStart: 1200 }), at('c', 400)];
  const plan = planDay(rides, { startMin: 540, start: { lat: 28, lng: -81 } });
  assert.deepEqual(plan.steps.map((s) => s.rideId), ['a', 'b', 'c']);
  assert.equal(plan.steps[1].usesLightningLane, false);
});

test('a long standby line with a far-off Lightning Lane window is saved for the window', () => {
  const rides = [at('a', 0), at('b', 200, { currentWait: 70, llStart: 1200 }), at('c', 400)];
  const plan = planDay(rides, { startMin: 540, start: { lat: 28, lng: -81 } });
  assert.deepEqual(plan.steps.map((s) => s.rideId), ['a', 'c', 'b']);
  assert.equal(plan.steps[2].usesLightningLane, true);
  assert.equal(plan.steps[2].arriveMin, 1200);
});
