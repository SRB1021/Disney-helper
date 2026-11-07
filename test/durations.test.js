const test = require('node:test');
const assert = require('node:assert');
const { rideDuration, DEFAULT_MIN } = require('../src/durations');
const { planDay } = require('../src/planner');

test('known rides get realistic lengths, unknown ones the default', () => {
  assert.equal(rideDuration('Haunted Mansion'), 9);
  assert.equal(rideDuration('Seven Dwarfs Mine Train'), 3);
  assert.equal(rideDuration('Pirates of the Caribbean'), 9);
  assert.equal(rideDuration("Rock 'n' Roller Coaster Starring Aerosmith"), 3);
  assert.equal(rideDuration('Totally Unknown Ride'), DEFAULT_MIN);
});

test('planner uses each ride\'s own length', () => {
  const rides = [{ id: 'a', name: 'Long', currentWait: 10, durationMin: 20 }];
  const s = planDay(rides, { startMin: 540 }).steps[0];
  assert.equal(s.rideMin, 20);
  assert.equal(s.endMin, 570); // 10 wait + 20 ride
});

test('values checked against Wikipedia', () => {
  assert.equal(rideDuration("Walt Disney's Enchanted Tiki Room"), 16);
  assert.equal(rideDuration('The American Adventure'), 29);
  assert.equal(rideDuration('Impressions de France'), 18);
  assert.equal(rideDuration('Living with the Land'), 15);
  assert.equal(rideDuration('Guardians of the Galaxy: Cosmic Rewind'), 3);
  assert.equal(rideDuration('Toy Story Mania!'), 6);
});

test('rideInfo labels where each number comes from', () => {
  const { rideInfo } = require('../src/durations');
  assert.deepEqual(rideInfo('Seven Dwarfs Mine Train'), { minutes: 3, source: 'checked' });
  assert.deepEqual(rideInfo('Haunted Mansion'), { minutes: 9, source: 'estimate' });
  assert.deepEqual(rideInfo('Totally Unknown Ride'), { minutes: 5, source: 'default' });
  assert.equal(rideInfo('Beauty and the Beast Sing-Along').minutes, 15);
  assert.equal(rideInfo('Castaway Creek').minutes, 30);
});

test('the plan API uses a ride length the user set, and falls back to the table', async () => {
  const { createApp } = require('../server');
  const { openDb } = require('../src/db');
  const ride = { id: 'r1', name: 'Haunted Mansion', status: 'OPERATING', standby: 10, lat: 28.42, lng: -81.58, llMulti: null, llSingle: null };
  const api = { getLive: async () => [ride], getLocations: async () => ({ center: { lat: 28.42, lng: -81.58 } }) };
  const db = openDb(':memory:');
  const srv = createApp({ db, api }).listen(0);
  try {
    const post = async (durations) => (await fetch(`http://127.0.0.1:${srv.address().port}/api/plan`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parkId: 'p', mustDos: ['r1'], startMin: 540, endMin: 1260, durations }),
    })).json();
    assert.equal((await post({})).steps[0].rideMin, 9);
    assert.equal((await post({ r1: 20 })).steps[0].rideMin, 20);
    assert.equal((await post({ r1: 9999 })).steps[0].rideMin, 9);      // out of range ignored
    assert.equal((await post({ r1: 'abc' })).steps[0].rideMin, 9);
  } finally { srv.close(); db.close(); }
});

test('plan API leaves closed and down rides out and reports them', async () => {
  const { createApp } = require('../server');
  const { openDb } = require('../src/db');
  const mk = (id, name, status) => ({ id, name, status, standby: status === 'OPERATING' ? 10 : null, lat: 28.42, lng: -81.58, llMulti: null, llSingle: null });
  const rides = [mk('a', 'Open Ride', 'OPERATING'), mk('b', 'Closed Ride', 'CLOSED'), mk('c', 'Down Ride', 'DOWN')];
  const api = { getLive: async () => rides, getLocations: async () => ({ center: { lat: 28.42, lng: -81.58 } }) };
  const db = openDb(':memory:');
  const srv = createApp({ db, api }).listen(0);
  try {
    const call = async (mustDos) => (await fetch(`http://127.0.0.1:${srv.address().port}/api/plan`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ parkId: 'p', mustDos, startMin: 540, endMin: 1260 }),
    })).json();
    const plan = await call(['a', 'b', 'c']);
    assert.deepEqual(plan.steps.map((s) => s.rideId), ['a']);
    assert.deepEqual(plan.unavailable.map((u) => [u.id, u.status]), [['b', 'CLOSED'], ['c', 'DOWN']]);
    const none = await call(['b']);
    assert.equal(none.steps.length, 0);
  } finally { srv.close(); db.close(); }
});
