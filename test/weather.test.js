const test = require('node:test');
const assert = require('node:assert');
const { normalize, describe } = require('../src/weather');

test('describes WMO codes', () => {
  assert.deepEqual(describe(0), { label: 'Clear', emoji: '☀️' });
  assert.equal(describe(95).label, 'Thunderstorms');
  assert.equal(describe(12345).label, 'Unknown');
});

test('normalizes Open-Meteo output', () => {
  const raw = {
    hourly: { time: ['2026-11-05T09:00', '2026-11-05T10:00'], temperature_2m: [71.6, 74.2], precipitation_probability: [10, null], weather_code: [1, 61] },
    daily: { time: ['2026-11-05'], temperature_2m_max: [84.4], temperature_2m_min: [66.1], precipitation_probability_max: [40], weather_code: [2], sunrise: ['2026-11-05T06:50'], sunset: ['2026-11-05T17:40'] },
  };
  const w = normalize(raw);
  assert.equal(w.hours[0].temp, 72);
  assert.equal(w.hours[1].rain, 0);
  assert.equal(w.hours[1].emoji, '🌧️');
  assert.deepEqual([w.days[0].hi, w.days[0].lo, w.days[0].rain], [84, 66, 40]);
});
