// Typical wait = median of past samples for the same day-of-week and hour.
function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

const MIN_SAMPLES = 3;

// samples: [{dow, hour, standby}] -> { hour: {median, n} } for one day-of-week.
// Falls back to all days if that weekday has too little data.
function typicalByHour(samples, dow) {
  const build = (rows) => {
    const buckets = {};
    for (const r of rows) (buckets[r.hour] ||= []).push(r.standby);
    const out = {};
    for (const [h, arr] of Object.entries(buckets)) {
      if (arr.length >= MIN_SAMPLES) out[h] = { median: median(arr), n: arr.length };
    }
    return out;
  };
  const sameDay = build(samples.filter((s) => s.dow === dow));
  if (Object.keys(sameDay).length >= 3) return { basis: 'weekday', hours: sameDay };
  return { basis: 'all-days', hours: build(samples) };
}

function bestHour(hours) {
  let best = null;
  for (const [h, v] of Object.entries(hours)) {
    if (!best || v.median < best.median) best = { hour: Number(h), median: v.median };
  }
  return best;
}

// Predicted wait at a given hour; null when there is no data.
function predictAt(hours, hour) {
  return hours[hour]?.median ?? null;
}

// How busy is the park right now? Average standby wait of open rides.
function crowdFrom(rides) {
  const waits = rides.filter((r) => r.status === 'OPERATING' && r.standby != null).map((r) => r.standby);
  if (!waits.length) return null;
  const avg = Math.round(waits.reduce((a, b) => a + b, 0) / waits.length);
  const [key, label, emoji] = avg < 20 ? ['low', 'Low', '🟢'] : avg < 35 ? ['moderate', 'Moderate', '🟡']
    : avg < 50 ? ['high', 'High', '🟠'] : ['veryhigh', 'Very high', '🔴'];
  return { key, label, emoji, avg, rides: waits.length };
}

module.exports = { median, typicalByHour, bestHour, predictAt, crowdFrom };
