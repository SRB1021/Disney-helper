const $ = (s) => document.querySelector(s);
const state = { parks: [], parkId: null, rides: [], chart: null, map: null, layer: null, me: null, meMarker: null, center: null };
const isOpen = (r) => r.status === 'OPERATING';
const WALK_M_PER_MIN = 80;
const picks = new Set(JSON.parse(localStorage.getItem('mustDos') || '[]'));

async function j(url, opts) {
  const r = await fetch(url, opts);
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || r.statusText);
  return body;
}
const cls = (m) => (m == null ? 'off' : m <= 30 ? 'good' : m <= 60 ? 'mid' : 'bad');
const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) : '';
const fmtMin = (m) => { const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0'); return `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'AM' : 'PM'}`; };
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

function llText(r) {
  const parts = [];
  if (r.llMulti) parts.push(r.llMulti.state === 'AVAILABLE' ? `LL return ${fmtTime(r.llMulti.start)}` : 'LL finished');
  if (r.llSingle) parts.push(r.llSingle.state === 'AVAILABLE'
    ? `LL Single Pass ${r.llSingle.price != null ? '$' + r.llSingle.price : ''} · ${fmtTime(r.llSingle.start)}` : 'Single Pass sold out');
  return parts.join(' · ');
}

function renderRides() {
  const open = $('#openOnly').checked, sort = $('#sort').value;
  let rides = state.rides.filter((r) => !open || r.status === 'OPERATING');
  const byOpen = (a, b) => isOpen(b) - isOpen(a);
  rides.sort((a, b) => byOpen(a, b) || (sort === 'name' ? a.name.localeCompare(b.name)
    : sort === 'wait-desc' ? (b.standby ?? -1) - (a.standby ?? -1) : (a.standby ?? 999) - (b.standby ?? 999)));
  $('#rides').innerHTML = rides.map((r) => `
    <li class="ride${isOpen(r) ? '' : ' unavailable'}" data-id="${r.id}">
      <div class="name">${r.name}<div class="ll">${r.status !== 'OPERATING' ? r.status : llText(r)}</div></div>
      ${r.trend ? `<span class="trend ${r.trend > 0 ? 'up' : 'down'}">${r.trend > 0 ? '▲' : '▼'}${Math.abs(r.trend)}</span>` : ''}
      <span class="badge ${isOpen(r) ? cls(r.standby) : 'off'}">${isOpen(r) && r.standby != null ? r.standby + ' min' : '—'}</span>
    </li>`).join('') || '<li class="muted">No rides to show.</li>';
}

function renderPicks() {
  $('#picks').innerHTML = state.rides.map((r) => `
    <li class="ride${isOpen(r) ? '' : ' unavailable'}"><label class="name"><input type="checkbox" data-id="${r.id}" ${picks.has(r.id) ? 'checked' : ''} ${isOpen(r) ? '' : 'disabled'}> ${r.name}${isOpen(r) ? '' : ' (' + r.status.toLowerCase() + ')'}</label></li>`).join('');
}

async function loadLive() {
  if (!state.parkId) return;
  try {
    $('#error').hidden = true;
    state.rides = await j(`/api/parks/${state.parkId}/live`);
    $('#updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
    renderRides(); renderPicks(); renderMap();
    if (planBuilt && picks.size) buildPlan({ silent: true });   // keep the plan in sync with new waits
  } catch (e) { $('#error').textContent = `Couldn't load wait times: ${e.message}`; $('#error').hidden = false; }
}

function selectPark(id) {
  state.parkId = id; state.fitted = null; planBuilt = false; $('#timeline').innerHTML = ''; $('#planNote').textContent = '';
  document.querySelectorAll('#parks button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  loadLive();
}

function distM(a, b) {
  const R = 6371000, rad = (d) => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Best next ride = lowest (wait + walking time). Without your location, lowest wait.
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

function pin(r, extra = '') {
  const c = isOpen(r) ? cls(r.standby) : 'off';
  return L.divIcon({ className: '', iconSize: [26, 26], html: `<div class="pin ${c} ${extra}">${isOpen(r) && r.standby != null ? r.standby : ''}</div>` });
}

function renderMap() {
  if (!window.L || $('#map').hidden) return;
  if (!state.map) { state.map = L.map('mapEl'); L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(state.map); }
  state.layer?.remove(); state.layer = L.layerGroup().addTo(state.map);
  const best = suggest();
  const located = state.rides.filter((r) => r.lat != null);
  for (const r of located) {
    const isBest = best && best.ride.id === r.id;
    const icon = isBest ? L.divIcon({ className: '', iconSize: [34, 34], html: '<div class="pin star">⭐</div>' }) : pin(r);
    L.marker([r.lat, r.lng], { icon, zIndexOffset: isBest ? 1000 : 0 }).addTo(state.layer)
      .bindPopup(`<b>${r.name}</b><br>${isOpen(r) ? (r.standby != null ? r.standby + ' min wait' : 'Open') : r.status}`);
  }
  if (best && state.me) L.polyline([[state.me.lat, state.me.lng], [best.ride.lat, best.ride.lng]], { color: '#5b3fd6', dashArray: '6 8' }).addTo(state.layer);
  $('#rec').innerHTML = best
    ? `⭐ <b>Go to ${best.ride.name}</b> — ${best.ride.standby} min wait${state.me ? `, about ${best.walk} min walk` : ''}.${state.me ? '' : ' <span class="muted">Tap “Show where I am” to include walking time.</span>'}`
    : 'No open rides with a known wait right now.';
  if (!state.fitted && located.length) {
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

async function showDetail(id) {
  const ride = state.rides.find((r) => r.id === id);
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

let planBuilt = false;
async function buildPlan({ silent = false } = {}) {
  const mustDos = [...picks];
  const out = $('#timeline');
  planBuilt = true;
  if (!mustDos.length) { out.innerHTML = silent ? '' : '<li>Pick at least one ride first.</li>'; return; }
  try {
    const plan = await j('/api/plan', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parkId: state.parkId, mustDos, startMin: toMin($('#startTime').value), endMin: toMin($('#endTime').value), walkMin: Number($('#walk').value) }) });
    $('#planNote').textContent = 'Plan updated ' + new Date().toLocaleTimeString() + ' — it refreshes automatically when wait times change.';
    out.innerHTML = plan.steps.map((s) => `<li><b>${s.name}</b> — arrive ${fmtMin(s.arriveMin)}, ${s.usesLightningLane ? 'Lightning Lane' : `wait ~${s.waitMin} min`}, done ${fmtMin(s.endMin)}</li>`).join('')
      + (plan.skipped.length ? `<li class="muted">Won't fit before close: ${plan.skipped.map((id) => state.rides.find((r) => r.id === id)?.name).join(', ')}</li>` : '');
  } catch (e) { out.innerHTML = `<li class="error">${e.message}</li>`; }
}

document.addEventListener('click', (e) => {
  const park = e.target.closest('#parks button'); if (park) return selectPark(park.dataset.id);
  const tab = e.target.closest('.tabs button');
  if (tab) {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b === tab));
    $('#live').hidden = tab.dataset.view !== 'live'; $('#plan').hidden = tab.dataset.view !== 'plan'; $('#map').hidden = tab.dataset.view !== 'map';
    if (tab.dataset.view === 'map') { renderMap(); setTimeout(() => state.map?.invalidateSize(), 50); } return;
  }
  const ride = e.target.closest('#rides .ride'); if (ride) showDetail(ride.dataset.id);
});
$('#picks').addEventListener('change', (e) => {
  e.target.checked ? picks.add(e.target.dataset.id) : picks.delete(e.target.dataset.id);
  try { localStorage.setItem('mustDos', JSON.stringify([...picks])); } catch {}
  if (planBuilt) buildPlan({ silent: true });
});
$('#sort').addEventListener('change', renderRides);
$('#openOnly').addEventListener('change', renderRides);
$('#locate').addEventListener('click', locate);
$('#build').addEventListener('click', buildPlan);

(async function init() {
  try {
    state.parks = await j('/api/parks');
    $('#parks').innerHTML = state.parks.map((p) => `<button data-id="${p.id}">${p.name}</button>`).join('');
    selectPark(state.parks[0].id);
    setInterval(loadLive, 60_000);
  } catch (e) { $('#error').textContent = `Couldn't load parks: ${e.message}`; $('#error').hidden = false; }
})();
