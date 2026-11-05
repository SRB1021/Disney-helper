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
