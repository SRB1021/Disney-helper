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
