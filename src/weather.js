// Weather forecast from Open-Meteo (free, no API key): https://open-meteo.com
const { fetchRetry } = require('./http');
const TTL_MS = 15 * 60_000;
const cache = new Map();

const CODES = [
  [[0], 'Clear', '☀️'], [[1], 'Mostly clear', '🌤️'], [[2], 'Partly cloudy', '⛅'], [[3], 'Cloudy', '☁️'],
  [[45, 48], 'Fog', '🌫️'], [[51, 53, 55, 56, 57], 'Drizzle', '🌦️'], [[61, 63, 65, 66, 67], 'Rain', '🌧️'],
  [[71, 73, 75, 77, 85, 86], 'Snow', '❄️'], [[80, 81, 82], 'Showers', '🌦️'], [[95, 96, 99], 'Thunderstorms', '⛈️'],
];
function describe(code) {
  const hit = CODES.find(([codes]) => codes.includes(code));
  return hit ? { label: hit[1], emoji: hit[2] } : { label: 'Unknown', emoji: '❓' };
}

function normalize(raw) {
  const h = raw.hourly, d = raw.daily;
  const hours = h.time.map((time, i) => ({
    time, temp: Math.round(h.temperature_2m[i]), rain: h.precipitation_probability[i] ?? 0,
    code: h.weather_code[i], ...describe(h.weather_code[i]),
  }));
  const days = d.time.map((date, i) => ({
    date, hi: Math.round(d.temperature_2m_max[i]), lo: Math.round(d.temperature_2m_min[i]),
    rain: d.precipitation_probability_max[i] ?? 0, code: d.weather_code[i], ...describe(d.weather_code[i]),
    sunrise: d.sunrise[i], sunset: d.sunset[i],
  }));
  return { days, hours };
}

async function getWeather(lat, lng) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat}&longitude=${lng}&temperature_unit=fahrenheit&timezone=America%2FNew_York&forecast_days=3`
    + '&hourly=temperature_2m,precipitation_probability,weather_code'
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunrise,sunset';
  const res = await fetchRetry(url);
  if (!res.ok) throw new Error(`Open-Meteo -> ${res.status}`);
  const data = { ...normalize(await res.json()), updated: Date.now() };
  cache.set(key, { at: Date.now(), data });
  return data;
}

module.exports = { getWeather, normalize, describe };
