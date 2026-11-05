const $ = (s) => document.querySelector(s);
const state = { parks: [], parkId: null, rides: [], chart: null };
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
  rides.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name)
    : sort === 'wait-desc' ? (b.standby ?? -1) - (a.standby ?? -1) : (a.standby ?? 999) - (b.standby ?? 999));
  $('#rides').innerHTML = rides.map((r) => `
    <li class="ride" data-id="${r.id}">
      <div class="name">${r.name}<div class="ll">${r.status !== 'OPERATING' ? r.status : llText(r)}</div></div>
      ${r.trend ? `<span class="trend ${r.trend > 0 ? 'up' : 'down'}">${r.trend > 0 ? '▲' : '▼'}${Math.abs(r.trend)}</span>` : ''}
      <span class="badge ${cls(r.standby)}">${r.standby != null ? r.standby + ' min' : '—'}</span>
    </li>`).join('') || '<li class="muted">No rides to show.</li>';
}

function renderPicks() {
  $('#picks').innerHTML = state.rides.map((r) => `
    <li class="ride"><label class="name"><input type="checkbox" data-id="${r.id}" ${picks.has(r.id) ? 'checked' : ''}> ${r.name}</label></li>`).join('');
}

async function loadLive() {
  if (!state.parkId) return;
  try {
    $('#error').hidden = true;
    state.rides = await j(`/api/parks/${state.parkId}/live`);
    $('#updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
    renderRides(); renderPicks();
  } catch (e) { $('#error').textContent = `Couldn't load wait times: ${e.message}`; $('#error').hidden = false; }
}

function selectPark(id) {
  state.parkId = id;
  document.querySelectorAll('#parks button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  loadLive();
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

async function buildPlan() {
  const mustDos = [...picks];
  const out = $('#timeline');
  if (!mustDos.length) { out.innerHTML = '<li>Pick at least one ride first.</li>'; return; }
  try {
    const plan = await j('/api/plan', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parkId: state.parkId, mustDos, startMin: toMin($('#startTime').value), endMin: toMin($('#endTime').value), walkMin: Number($('#walk').value) }) });
    out.innerHTML = plan.steps.map((s) => `<li><b>${s.name}</b> — arrive ${fmtMin(s.arriveMin)}, ${s.usesLightningLane ? 'Lightning Lane' : `wait ~${s.waitMin} min`}, done ${fmtMin(s.endMin)}</li>`).join('')
      + (plan.skipped.length ? `<li class="muted">Won't fit before close: ${plan.skipped.map((id) => state.rides.find((r) => r.id === id)?.name).join(', ')}</li>` : '');
  } catch (e) { out.innerHTML = `<li class="error">${e.message}</li>`; }
}

document.addEventListener('click', (e) => {
  const park = e.target.closest('#parks button'); if (park) return selectPark(park.dataset.id);
  const tab = e.target.closest('.tabs button');
  if (tab) {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b === tab));
    $('#live').hidden = tab.dataset.view !== 'live'; $('#plan').hidden = tab.dataset.view !== 'plan'; return;
  }
  const ride = e.target.closest('#rides .ride'); if (ride) showDetail(ride.dataset.id);
});
$('#picks').addEventListener('change', (e) => {
  e.target.checked ? picks.add(e.target.dataset.id) : picks.delete(e.target.dataset.id);
  try { localStorage.setItem('mustDos', JSON.stringify([...picks])); } catch {}
});
$('#sort').addEventListener('change', renderRides);
$('#openOnly').addEventListener('change', renderRides);
$('#build').addEventListener('click', buildPlan);

(async function init() {
  try {
    state.parks = await j('/api/parks');
    $('#parks').innerHTML = state.parks.map((p) => `<button data-id="${p.id}">${p.name}</button>`).join('');
    selectPark(state.parks[0].id);
    setInterval(loadLive, 60_000);
  } catch (e) { $('#error').textContent = `Couldn't load parks: ${e.message}`; $('#error').hidden = false; }
})();
