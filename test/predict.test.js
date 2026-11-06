const test = require('node:test');
const assert = require('node:assert');
const { median, typicalByHour, bestHour } = require('../src/predict');

test('median handles odd, even, empty', () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([10, 20]), 15);
  assert.equal(median([]), null);
});

test('typicalByHour uses weekday data and ignores thin buckets', () => {
  const s = [];
  for (const [h, w] of [[9, 20], [12, 60], [18, 30]]) for (let i = 0; i < 3; i++) s.push({ dow: 2, hour: h, standby: w });
  s.push({ dow: 2, hour: 14, standby: 99 }); // only 1 sample -> dropped
  const t = typicalByHour(s, 2);
  assert.equal(t.basis, 'weekday');
  assert.equal(t.hours[12].median, 60);
  assert.equal(t.hours[14], undefined);
  assert.deepEqual(bestHour(t.hours), { hour: 9, median: 20 });
});

test('falls back to all days when weekday is sparse', () => {
  const s = [];
  for (const d of [0, 1, 2]) for (const h of [9, 12, 15]) s.push({ dow: d, hour: h, standby: h });
  assert.equal(typicalByHour(s, 5).basis, 'all-days');
});

test('crowdFrom averages open rides and picks a level', () => {
  const { crowdFrom } = require('../src/predict');
  const rides = [{ status: 'OPERATING', standby: 10 }, { status: 'OPERATING', standby: 50 }, { status: 'CLOSED', standby: null }, { status: 'DOWN', standby: 90 }];
  const c = crowdFrom(rides);
  assert.equal(c.avg, 30);
  assert.equal(c.label, 'Moderate');
  assert.equal(c.rides, 2);
  assert.equal(crowdFrom([{ status: 'CLOSED', standby: null }]), null);
});
