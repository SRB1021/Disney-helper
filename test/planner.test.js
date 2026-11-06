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
