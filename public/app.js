const $ = (s) => document.querySelector(s);
const NY = 'America/New_York';
const WALK_M_PER_MIN = 80;

// ---------- small helpers ----------
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function j(url, opts) {
  const r = await fetch(url, opts);
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || r.statusText);
  return body;
}
const cls = (m) => (m == null ? 'off' : m <= 30 ? 'good' : m <= 60 ? 'mid' : 'bad');
const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: NY }) : '';
const fmtMin = (m) => { const h = Math.floor(m / 60) % 24, mm = String(m % 60).padStart(2, '0'); return `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'AM' : 'PM'}`; };
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const toHHMM = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: NY });
function isoToMin(iso) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: NY, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date(iso));
  const g = (t) => Number(p.find((x) => x.type === t).value);
  return (g('hour') % 24) * 60 + g('minute');
}
const dayOf = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: NY }).format(new Date(d));
const nowMin = () => isoToMin(new Date().toISOString());
const isOpen = (r) => r.status === 'OPERATING';
const isDown = (r) => r.status === 'DOWN';           // temporarily down, may reopen
const rideClass = (r) => (isOpen(r) ? '' : isDown(r) ? ' down' : ' unavailable');
const openRank = (r) => (isOpen(r) ? 0 : isDown(r) ? 1 : 2);

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 9000);
}

// ---------- state ----------
const state = {
  parks: [], parkId: null, rides: [], shows: [], plan: null, weather: null,
  me: null, map: null, layer: null, meMarker: null, fitted: null, chart: null, fchart: null,
  filter: 'all', q: '', hours: null,
};
const picks = new Set(store.get('mustDos', []));
const favs = new Set(store.get('favs', []));
const alerts = store.get('alerts', {});      // rideId -> wait threshold (minutes)
const alertFired = {};                       // rideId -> already notified?
let showPicks = store.get('showPicks', []);  // [{id, name, start, durMin}]
let planBuilt = false;

// ---------- quick park chooser ----------
const PARK_LOOK = [
  [/magic kingdom/i, '🏰', 'MK'], [/hollywood/i, '🎬', 'HS'], [/animal/i, '🌳', 'AK'],
  [/epcot/i, '🌐', 'EPCOT'], [/typhoon/i, '🌊', 'TL'], [/blizzard/i, '❄️', 'BB'],
];
const parkRank = (name) => { const i = PARK_LOOK.findIndex(([re]) => re.test(name)); return i < 0 ? 99 : i; };
const parkLook = (name) => { const m = PARK_LOOK.find(([re]) => re.test(name)); return m ? { emoji: m[1], short: m[2] } : { emoji: '🎢', short: name.slice(0, 6) }; };

function renderParkBar() {
  $('#parkbar').innerHTML = state.parks.map((p, i) => {
    const l = parkLook(p.name);
    return `<button data-id="${p.id}" title="${esc(p.name)} (press ${i + 1})" aria-label="${esc(p.name)}"><span>${l.emoji}</span><b>${esc(l.short)}</b></button>`;
  }).join('');
}

// ---------- live list ----------
function llText(r) {
  const parts = [];
  if (r.llMulti) parts.push(r.llMulti.state === 'AVAILABLE' ? `LL return ${fmtTime(r.llMulti.start)}` : 'LL finished');
  if (r.llSingle) parts.push(r.llSingle.state === 'AVAILABLE'
    ? `LL Single Pass ${r.llSingle.price != null ? '$' + r.llSingle.price : ''} · ${fmtTime(r.llSingle.start)}` : 'Single Pass sold out');
  return parts.join(' · ');
}
const hasLL = (r) => r.llMulti?.state === 'AVAILABLE' || r.llSingle?.state === 'AVAILABLE';

function renderRides() {
  const sort = $('#sort').value, q = state.q.trim().toLowerCase();
  let rides = state.rides.filter((r) => {
    if (q && !r.name.toLowerCase().includes(q)) return false;
    switch (state.filter) {
      case 'fav': return favs.has(r.id);
      case 'll': return hasLL(r);
      case 'short': return isOpen(r) && r.standby != null && r.standby <= 30;
      case 'open': return isOpen(r);
      default: return true;
    }
  });
  const byOpen = (a, b) => openRank(a) - openRank(b);
  rides.sort((a, b) => byOpen(a, b) || (sort === 'name' ? a.name.localeCompare(b.name)
    : sort === 'wait-desc' ? (b.standby ?? -1) - (a.standby ?? -1) : (a.standby ?? 999) - (b.standby ?? 999)));
  $('#rides').innerHTML = rides.map((r) => `
    <li class="ride${rideClass(r)}" data-id="${r.id}">
      <button class="icon" data-fav="${r.id}" aria-label="Favorite" title="Favorite">${favs.has(r.id) ? '★' : '☆'}</button>
      <div class="name">${esc(r.name)}<div class="ll">${isOpen(r) ? esc(llText(r)) : isDown(r) ? 'Temporarily down — may reopen' : esc(r.status)}</div></div>
      ${r.trend ? `<span class="trend ${r.trend > 0 ? 'up' : 'down'}">${r.trend > 0 ? '▲' : '▼'}${Math.abs(r.trend)}</span>` : ''}
      ${isOpen(r) || isDown(r) ? `<button class="icon bell${alerts[r.id] != null ? ' on' : ''}" data-bell="${r.id}" aria-label="Alert" title="${alerts[r.id] === 'reopen' ? 'Will tell you when it reopens (tap to cancel)' : alerts[r.id] != null ? `Alert at ≤ ${alerts[r.id]} min (tap to cancel)` : isDown(r) ? 'Tell me when it reopens' : 'Alert me when the wait drops'}">🔔</button>` : ''}
      <span class="badge ${isOpen(r) ? cls(r.standby) : isDown(r) ? 'down' : 'off'}">${isOpen(r) && r.standby != null ? r.standby + ' min' : isDown(r) ? 'Down' : '—'}</span>
    </li>`).join('') || '<li class="muted">No rides to show.</li>';
}

function renderPicks() {
  $('#picks').innerHTML = state.rides.map((r) => `
    <li class="ride${rideClass(r)}"><label class="name"><input type="checkbox" data-id="${r.id}" ${picks.has(r.id) ? 'checked' : ''} ${isOpen(r) ? '' : 'disabled'}> ${esc(r.name)}${isOpen(r) ? '' : isDown(r) ? ' (down — may reopen)' : ' (' + esc(r.status.toLowerCase()) + ')'}</label></li>`).join('');
}

// ---------- ride alerts ----------
function toggleBell(id) {
  const ride = state.rides.find((r) => r.id === id);
  if (alerts[id] != null) { delete alerts[id]; store.set('alerts', alerts); renderRides(); return; }
  if (ride && isDown(ride)) {
    alerts[id] = 'reopen'; store.set('alerts', alerts);
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    toast(`🔔 I'll tell you when ${ride.name} reopens.`); renderRides(); return;
  }
  const dflt = Math.max(5, Math.round(((ride?.standby ?? 30) - 10) / 5) * 5);
  const v = Number(window.prompt(`Alert me when ${ride?.name || 'this ride'} drops to this many minutes or less:`, String(dflt)));
  if (!Number.isFinite(v) || v < 0) return;
  alerts[id] = v; alertFired[id] = false; store.set('alerts', alerts);
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  renderRides(); checkAlerts();
}
function checkAlerts() {
  for (const r of state.rides) {
    const thr = alerts[r.id];
    if (thr === 'reopen') {                       // down ride: notify once it's operating again
      if (isOpen(r)) {
        delete alerts[r.id]; store.set('alerts', alerts);
        const msg = `${r.name} has reopened!`;
        toast('🔔 ' + msg);
        if ('Notification' in window && Notification.permission === 'granted') new Notification('Disney Helper', { body: msg });
        renderRides();
      }
      continue;
    }
    if (thr == null || !isOpen(r) || r.standby == null) continue;
    if (r.standby <= thr) {
      if (!alertFired[r.id]) {
        alertFired[r.id] = true;
        const msg = `${r.name} is down to ${r.standby} min!`;
        toast('🔔 ' + msg);
        if ('Notification' in window && Notification.permission === 'granted') new Notification('Disney Helper', { body: msg });
      }
    } else alertFired[r.id] = false;
  }
}

// ---------- loading ----------
async function loadLive() {
  if (!state.parkId) return;
  const id = state.parkId;
  try {
    $('#error').hidden = true;
    const [rides, shows, summary] = await Promise.all([
      j(`/api/parks/${id}/live`),
      j(`/api/parks/${id}/shows`).catch(() => []),
      j(`/api/parks/${id}/summary`).catch(() => null),
    ]);
    if (id !== state.parkId) return;               // user switched parks meanwhile
    state.rides = rides; state.shows = shows;
    $('#updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
    renderSummary(summary); renderRides(); renderPicks(); renderShows(); renderMap(); checkAlerts();
    if (planBuilt && picks.size) buildPlan({ silent: true });   // keep the plan in sync with new waits
  } catch (e) { $('#error').textContent = `Couldn't load wait times: ${e.message}`; $('#error').hidden = false; }
}

function renderSummary(s) {
  const out = [];
  const h = s?.hours;
  if (h) {
    state.hours = h;
    out.push(`<span class="pill">🕘 Open ${fmtTime(h.open)} – ${fmtTime(h.close)}</span>`);
    if (h.earlyEntry) out.push(`<span class="pill">🚪 Early Entry ${fmtTime(h.earlyEntry.open)}</span>`);
    if (h.multiPass) out.push(`<span class="pill">⚡ Multi Pass ${h.multiPass.price != null ? '$' + h.multiPass.price : ''} ${h.multiPass.available ? '' : '(sold out)'}</span>`);
    if (!renderSummary.setFor || renderSummary.setFor !== state.parkId) {   // default the planner to park hours once per park
      renderSummary.setFor = state.parkId;
      $('#startTime').value = toHHMM(h.open); $('#endTime').value = toHHMM(h.close);
    }
  } else out.push('<span class="pill">🕘 Hours unavailable today</span>');
  const c = s?.crowd;
  if (c) out.push(`<span class="pill crowd-${c.key}">${c.emoji} Crowds: <b>${c.label}</b> · avg ${c.avg} min across ${c.rides} rides</span>`);
  $('#summary').innerHTML = out.join('');
}

async function loadForecast() {
  const id = state.parkId;
  try {
    const f = await j(`/api/parks/${id}/forecast`);
    if (id !== state.parkId) return;
    state.fchart?.destroy(); state.fchart = null;
    if (!f.ready) { $('#fnote').textContent = 'Still collecting data — this fills in after the site has been watching waits for a few days.'; $('#fcanvas').hidden = true; return; }
    $('#fcanvas').hidden = false;
    const hrs = Object.keys(f.hours).map(Number).sort((a, b) => a - b);
    $('#fnote').textContent = `Median ride wait by hour (${f.basis === 'weekday' ? 'this day of the week' : 'all days'}).`;
    state.fchart = new Chart($('#fcanvas'), {
      type: 'bar',
      data: { labels: hrs.map((h) => fmtMin(h * 60)), datasets: [{ label: 'Typical wait (min)', data: hrs.map((h) => f.hours[h].median), backgroundColor: '#5b3fd6' }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
    });
  } catch { $('#fnote').textContent = ''; }
}

function selectPark(id) {
  if (!state.parks.some((p) => p.id === id)) return;
  state.parkId = id; state.fitted = null; state.plan = null; state.weather = null; state.rides = []; state.shows = [];
  planBuilt = false; $('#timeline').innerHTML = ''; $('#planNote').textContent = '';
  store.set('park', id);
  document.querySelectorAll('#parkbar button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  $('#rides').innerHTML = '<li class="muted">Loading…</li>';
  loadLive(); loadForecast();
  if (!$('#weather').hidden) loadWeather();
}

// ---------- map ----------
function distM(a, b) {
  const R = 6371000, rad = (d) => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function suggest() {
  const cands = state.rides.filter((r) => isOpen(r) && r.standby != null && r.lat != null);
  let best = null;
  for (const r of cands) {
    const walk = state.me ? Math.round(distM(state.me, r) / WALK_M_PER_MIN) : 0;
    const total = r.standby + walk;
    if (!best || total < best.total) best = { ride: r, walk, total };
  }
  return best;
}
const pin = (r) => L.divIcon({ className: '', iconSize: [26, 26], html: `<div class="pin ${isOpen(r) ? cls(r.standby) : isDown(r) ? 'down' : 'off'}">${isOpen(r) && r.standby != null ? r.standby : isDown(r) ? '!' : ''}</div>` });

function renderMap() {
  if (!window.L || $('#map').hidden) return;
  if (!state.map) {
    state.map = L.map('mapEl');
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(state.map);
  }
  state.layer?.remove(); state.layer = L.layerGroup().addTo(state.map);
  const located = state.rides.filter((r) => r.lat != null);
  const byId = Object.fromEntries(located.map((r) => [r.id, r]));

  // Plan path: ordered ride stops (events/shows have no coordinates).
  const stops = (state.plan?.steps || []).filter((s) => s.kind === 'ride' && byId[s.rideId]).map((s, i) => ({ ...s, n: i + 1, ride: byId[s.rideId] }));
  const next = stops.find((s) => s.endMin > nowMin()) || stops[0];
  const best = stops.length ? null : suggest();
  const starId = next ? next.ride.id : best?.ride.id;
  const stepNum = Object.fromEntries(stops.map((s) => [s.ride.id, s.n]));

  for (const r of located) {
    let icon = pin(r), z = 0;
    if (stepNum[r.id]) { icon = L.divIcon({ className: '', iconSize: [30, 30], html: `<div class="pin step">${stepNum[r.id]}</div>` }); z = 900; }
    if (r.id === starId && !stepNum[r.id]) { icon = L.divIcon({ className: '', iconSize: [34, 34], html: '<div class="pin star">⭐</div>' }); z = 1000; }
    L.marker([r.lat, r.lng], { icon, zIndexOffset: z }).addTo(state.layer)
      .bindPopup(`<b>${esc(r.name)}</b><br>${isOpen(r) ? (r.standby != null ? r.standby + ' min wait' : 'Open') : isDown(r) ? 'Temporarily down — may reopen' : esc(r.status)}${stepNum[r.id] ? `<br>Plan stop #${stepNum[r.id]}` : ''}`);
  }

  let rec;
  if (stops.length) {
    const pts = [...(state.me ? [state.me] : []), ...stops.map((s) => s.ride)].map((p) => ({ lat: p.lat, lng: p.lng }));
    L.polyline(pts.map((p) => [p.lat, p.lng]), { color: '#5b3fd6', weight: 4, opacity: .85 }).addTo(state.layer);
    let meters = 0; for (let i = 1; i < pts.length; i++) meters += distM(pts[i - 1], pts[i]);
    rec = `🗺️ <b>Your plan: ${stops.length} stop${stops.length > 1 ? 's' : ''}</b> · about ${(meters / 1609).toFixed(1)} mi of walking (straight-line). Next: <b>${esc(next.ride.name)}</b> (${fmtMin(next.startMin)}).`;
  } else if (best) {
    if (state.me) L.polyline([[state.me.lat, state.me.lng], [best.ride.lat, best.ride.lng]], { color: '#5b3fd6', dashArray: '6 8' }).addTo(state.layer);
    rec = `⭐ <b>Go to ${esc(best.ride.name)}</b> — ${best.ride.standby} min wait${state.me ? `, about ${best.walk} min walk` : ''}.${state.me ? '' : ' <span class="muted">Tap “Show where I am” to include walking time. Build a plan to see your route here.</span>'}`;
  } else rec = 'No open rides with a known wait right now.';
  $('#rec').innerHTML = rec;

  if (state.fitted !== state.parkId && located.length) {
    state.map.fitBounds(L.latLngBounds(located.map((r) => [r.lat, r.lng])).pad(0.1)); state.fitted = state.parkId;
  }
  if (state.me) drawMe();
}
function drawMe() {
  state.meMarker?.remove();
  state.meMarker = L.marker([state.me.lat, state.me.lng], { icon: L.divIcon({ className: '', iconSize: [16, 16], html: '<div class="you"></div>' }), interactive: false, zIndexOffset: 2000 }).addTo(state.map);
}
function locate() {
  if (!navigator.geolocation) { $('#locMsg').textContent = 'Your browser can’t share location.'; return; }
  $('#locMsg').textContent = 'Finding you…';
  navigator.geolocation.watchPosition((pos) => {
    state.me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    $('#locMsg').textContent = 'Location on';
    renderMap();
  }, (err) => { $('#locMsg').textContent = err.code === 1 ? 'Location blocked — allow it in your browser to see where you are.' : 'Couldn’t get your location.'; },
  { enableHighAccuracy: true, maximumAge: 15000 });
}

// ---------- shows ----------
const showKey = (id, start) => `${id}|${start}`;
function renderShows() {
  const now = Date.now();
  const rows = state.shows.map((s) => {
    const perf = s.times.filter((t) => t.type !== 'Operating' && new Date(t.start).getTime() > now);
    const win = s.times.find((t) => t.type === 'Operating');
    return { s, perf, win, next: perf[0] ? new Date(perf[0].start).getTime() : Infinity };
  }).filter((x) => x.perf.length || (x.win && x.s.status === 'OPERATING'))
    .sort((a, b) => a.next - b.next || a.s.name.localeCompare(b.s.name));
  $('#showList').innerHTML = rows.map(({ s, perf, win }) => `
    <li class="ride show${s.status === 'OPERATING' || perf.length ? '' : ' unavailable'}">
      <div class="name">${esc(s.name)}${!perf.length && win ? `<div class="ll">Open ${fmtTime(win.start)} – ${fmtTime(win.end)}</div>` : ''}</div>
      ${perf.length ? `<div class="times">${perf.map((t) => {
        const on = showPicks.some((p) => p.id === showKey(s.id, t.start));
        return `<button class="${on ? 'on' : ''}" data-show="${esc(s.id)}" data-start="${esc(t.start)}" data-end="${esc(t.end || '')}">${on ? '📌 ' : ''}${fmtTime(t.start)}</button>`;
      }).join('')}</div>` : ''}
    </li>`).join('') || '<li class="muted">No more shows or character meets today.</li>';
}
function toggleShow(btn) {
  const show = state.shows.find((s) => s.id === btn.dataset.show);
  const key = showKey(btn.dataset.show, btn.dataset.start);
  const i = showPicks.findIndex((p) => p.id === key);
  if (i >= 0) showPicks.splice(i, 1);
  else {
    const dur = btn.dataset.end ? Math.max(15, Math.round((new Date(btn.dataset.end) - new Date(btn.dataset.start)) / 60000)) : 30;
    showPicks.push({ id: key, name: show?.name || 'Show', start: btn.dataset.start, durMin: dur });
  }
  store.set('showPicks', showPicks);
  renderShows(); renderPinned();
  if (planBuilt) buildPlan({ silent: true });
}
function todaysPins() { const today = dayOf(Date.now()); return showPicks.filter((p) => dayOf(p.start) === today); }
function renderPinned() {
  const pins = todaysPins();
  $('#pinned').textContent = pins.length ? '📌 Pinned today: ' + pins.map((p) => `${p.name} ${fmtTime(p.start)}`).join(' · ') : 'Pin show times on the Shows tab to schedule them here.';
}

// ---------- weather ----------
async function loadWeather({ rebuild = true } = {}) {
  const id = state.parkId;
  $('#weatherBody').textContent = 'Loading forecast…';
  try {
    const w = await j(`/api/parks/${id}/weather`);
    if (id !== state.parkId) return;
    state.weather = w; renderWeather(); if (rebuild && planBuilt) buildPlan({ silent: true });
  } catch (e) { $('#weatherBody').innerHTML = `<div class="error">Couldn’t load the forecast: ${esc(e.message)}</div>`; }
}
function renderWeather() {
  const w = state.weather; if (!w) return;
  const today = dayOf(Date.now());
  const nowH = Number(new Intl.DateTimeFormat('en-US', { timeZone: NY, hour: 'numeric', hour12: false }).format(new Date())) % 24;
  const hrs = w.hours.filter((h) => h.time.slice(0, 10) === today && Number(h.time.slice(11, 13)) >= Math.max(7, nowH - 1) && Number(h.time.slice(11, 13)) <= 23);
  const wet = hrs.find((h) => h.rain >= 50 && Number(h.time.slice(11, 13)) >= nowH);
  const tip = wet ? `☔ Rain is likely around <b>${fmtMin(Number(wet.time.slice(11, 13)) * 60)}</b> — save indoor rides and shows for then.` : '😎 No rain expected for the rest of today.';
  const dayName = (d, i) => i === 0 ? 'Today' : new Date(d + 'T12:00:00').toLocaleDateString([], { weekday: 'long' });
  $('#weatherBody').innerHTML = `
    <div class="rec">${tip}</div>
    <div class="wdays">${w.days.map((d, i) => `
      <div class="wday"><div class="muted">${dayName(d.date, i)}</div><div class="big">${d.emoji}</div>
        <div>${esc(d.label)}</div><div class="temps">${d.hi}° / ${d.lo}°</div>
        <div class="muted">🌧️ ${d.rain}% · 🌅 ${fmtMin(Number(d.sunrise.slice(11, 13)) * 60 + Number(d.sunrise.slice(14, 16)))}</div></div>`).join('')}</div>
    <h3 style="margin-top:16px">Rest of today</h3>
    <div class="hourly">${hrs.map((h) => `<div class="hour${h.rain >= 50 ? ' rain' : ''}"><div>${fmtMin(Number(h.time.slice(11, 13)) * 60).replace(':00', '')}</div><div class="e">${h.emoji}</div><b>${h.temp}°</b><div class="muted">${h.rain}%</div></div>`).join('') || '<span class="muted">The park day is over.</span>'}</div>
    <p class="muted">Forecast for the park’s location (°F, park time). Blue outline = 50%+ chance of rain.</p>`;
}
function rainAt(min) {
  const w = state.weather; if (!w) return false;
  const today = dayOf(Date.now()), h = Math.floor(min / 60);
  const hit = w.hours.find((x) => x.time.slice(0, 10) === today && Number(x.time.slice(11, 13)) === h);
  return !!hit && hit.rain >= 60;
}

// ---------- ride detail ----------
async function showDetail(id) {
  const ride = state.rides.find((r) => r.id === id);
  if (!ride) return;
  $('#dName').textContent = ride.name;
  $('#dInfo').textContent = 'Loading…';
  $('#detail').showModal();
  const [hist, pred] = await Promise.all([j(`/api/rides/${id}/history?hours=24`), j(`/api/rides/${id}/predict`)]);
  const labels = hist.map((h) => new Date(h.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  $('#dInfo').textContent = pred.ready && pred.best
    ? `Typically shortest around ${fmtMin(pred.best.hour * 60)} (~${pred.best.median} min).`
    : 'Still collecting history — predictions appear after a few days of data.';
  state.chart?.destroy();
  state.chart = new Chart($('#chart'), {
    type: 'line',
    data: { labels, datasets: [{ label: 'Standby wait (min)', data: hist.map((h) => h.standby), tension: .3, spanGaps: true }] },
    options: { scales: { y: { beginAtZero: true } } },
  });
}

// ---------- planner ----------
async function buildPlan({ silent = false } = {}) {
  const mustDos = [...picks];
  const out = $('#timeline');
  planBuilt = true;
  if (!mustDos.length) { out.innerHTML = silent ? '' : '<li>Pick at least one ride first.</li>'; state.plan = null; renderMap(); return; }
  const events = todaysPins().map((p) => ({ name: '🎭 ' + p.name, startMin: isoToMin(p.start), durMin: p.durMin }));
  if ($('#meal').checked) events.push({ name: '🍽️ Meal break', startMin: toMin($('#mealTime').value), durMin: Number($('#mealLen').value) || 45 });
  try {
    if (!state.weather) await loadWeather({ rebuild: false });
    const plan = await j('/api/plan', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parkId: state.parkId, mustDos, events, startMin: toMin($('#startTime').value), endMin: toMin($('#endTime').value), walkMin: Number($('#walk').value) }) });
    state.plan = plan;
    $('#planNote').textContent = 'Plan updated ' + new Date().toLocaleTimeString() + ' — it refreshes automatically when wait times change. See your route on the Map tab.';
    let n = 0;
    out.innerHTML = plan.steps.map((s) => s.kind === 'event'
      ? `<li class="evt"><span class="num">📌</span><div><b>${esc(s.name)}</b> — ${fmtMin(s.startMin)}–${fmtMin(s.endMin)}${s.late ? ' <span class="muted">(you may arrive late)</span>' : ''}</div></li>`
      : `<li><span class="num">${++n}</span><div><b>${esc(s.name)}</b> — arrive ${fmtMin(s.arriveMin)}, ${s.usesLightningLane ? '⚡ Lightning Lane' : `wait ~${s.waitMin} min`} + ride ~${s.rideMin} min, done ${fmtMin(s.endMin)}${rainAt(s.arriveMin) ? ' ☔' : ''}</div></li>`).join('')
      + (plan.skipped.length ? `<li class="muted">Won't fit before close: ${plan.skipped.map((id) => esc(state.rides.find((r) => r.id === id)?.name)).join(', ')}</li>` : '');
    renderMap();
  } catch (e) { out.innerHTML = `<li class="error">${esc(e.message)}</li>`; }
}

// ---------- events ----------
function showView(view) {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  for (const v of ['live', 'map', 'plan', 'shows', 'weather']) $('#' + v).hidden = v !== view;
  if (view === 'map') { renderMap(); setTimeout(() => state.map?.invalidateSize(), 50); }
  if (view === 'weather') loadWeather();
  if (view === 'plan') renderPinned();
}

document.addEventListener('click', (e) => {
  const park = e.target.closest('#parkbar button'); if (park) return selectPark(park.dataset.id);
  const tab = e.target.closest('#tabs button'); if (tab) return showView(tab.dataset.view);
  const chip = e.target.closest('#chips button');
  if (chip) { state.filter = chip.dataset.f; document.querySelectorAll('#chips button').forEach((b) => b.classList.toggle('on', b === chip)); return renderRides(); }
  const fav = e.target.closest('[data-fav]');
  if (fav) { const id = fav.dataset.fav; favs.has(id) ? favs.delete(id) : favs.add(id); store.set('favs', [...favs]); return renderRides(); }
  const bell = e.target.closest('[data-bell]'); if (bell) return toggleBell(bell.dataset.bell);
  const sh = e.target.closest('[data-show]'); if (sh) return toggleShow(sh);
  const ride = e.target.closest('#rides .ride'); if (ride) showDetail(ride.dataset.id);
});
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  const n = Number(e.key);
  if (n >= 1 && n <= state.parks.length) selectPark(state.parks[n - 1].id);   // 1-6 jump between parks
});
$('#picks').addEventListener('change', (e) => {
  e.target.checked ? picks.add(e.target.dataset.id) : picks.delete(e.target.dataset.id);
  store.set('mustDos', [...picks]);
  if (planBuilt) buildPlan({ silent: true });
});
$('#search').addEventListener('input', (e) => { state.q = e.target.value; renderRides(); });
$('#sort').addEventListener('change', renderRides);
$('#locate').addEventListener('click', locate);
$('#build').addEventListener('click', () => buildPlan());
for (const id of ['#startTime', '#endTime', '#walk', '#meal', '#mealTime', '#mealLen']) $(id).addEventListener('change', () => { if (planBuilt) buildPlan({ silent: true }); });

(async function init() {
  try {
    const parks = await j('/api/parks');
    state.parks = parks.filter((p) => parkRank(p.name) < 99).sort((a, b) => parkRank(a.name) - parkRank(b.name));
    if (!state.parks.length) state.parks = parks;
    renderParkBar(); renderPinned();
    const saved = store.get('park', null);
    selectPark(state.parks.some((p) => p.id === saved) ? saved : state.parks[0].id);
    setInterval(loadLive, 60_000);
  } catch (e) { $('#error').textContent = `Couldn't load parks: ${e.message}`; $('#error').hidden = false; }
})();
