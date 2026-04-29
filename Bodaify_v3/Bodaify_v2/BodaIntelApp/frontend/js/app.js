/* ─── Bodaify ── Frontend App ───────────────────────────────── */

const API = window.location.origin;

// ── SUPABASE CLIENT ───────────────────────────────────────────────────────────
let _sb = null;

async function initSupabase() {
  try {
    const cfg = await fetch(`${API}/api/config`).then(r => r.json());
    if (window.supabase && cfg.supabase_url && cfg.supabase_key) {
      _sb = window.supabase.createClient(cfg.supabase_url, cfg.supabase_key);
      console.log('✓ Bodaify: Supabase ready →', cfg.project_id);
    }
  } catch(e) { console.warn('Supabase offline, local mode active:', e.message); }
}

async function sbUpsertUser(user) {
  if (!_sb) return;
  try {
    await _sb.from('users').upsert({
      email: user.email, full_name: user.full_name,
      sacco: user.sacco, role: user.role, rider_id: user.rider_id,
    }, { onConflict: 'email' });
  } catch(e) { /* non-critical */ }
}

async function sbLogFuelEntry(entry) {
  if (!_sb) return;
  try {
    await _sb.from('fuel_entries').insert({
      rider_id: entry.rider_id, date: entry.date,
      liters: entry.liters, cost_ugx: entry.cost_ugx,
      distance_km: entry.distance_km, station: entry.station,
    });
  } catch(e) { /* non-critical */ }
}

// ── AUTH ──────────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'bi-token';
const USER_KEY  = 'bi-user';

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function getUser()  {
  try { return JSON.parse(localStorage.getItem(USER_KEY)) || {}; }
  catch(e) { return {}; }
}

function authHeaders() {
  const t = getToken();
  return t ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` }
           : { 'Content-Type': 'application/json' };
}

// Override apiFetch to always send auth header
async function apiFetch(path, opts = {}) {
  try {
    const r = await fetch(API + path, {
      headers: authHeaders(),
      ...opts,
    });
    if (r.status === 401) {
      // Token expired → back to login
      handleLogout();
      return null;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    toast("API Error: " + e.message);
    return null;
  }
}

function post(path, body) {
  return apiFetch(path, { method: "POST", body: JSON.stringify(body) });
}

// ── AUTH GUARD ────────────────────────────────────────────────────────────────
async function checkAuth() {
  const token = getToken();
  if (!token) {
    window.location.href = '/login';
    return false;
  }
  // Verify token is still valid with server
  try {
    const r = await fetch(API + '/api/auth/me', { headers: authHeaders() });
    if (!r.ok) { handleLogout(); return false; }
    const user = await r.json();
    // Update stored user with fresh server data
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    sbUpsertUser(user);
    renderUserInfo(user);
    return true;
  } catch(e) {
    // Network error — use cached user if available
    const cached = getUser();
    if (cached && cached.email) { renderUserInfo(cached); return true; }
    handleLogout();
    return false;
  }
}

// ── GREETING + USER UI ────────────────────────────────────────────────────────
function getGreetingWord() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function renderUserInfo(user) {
  const first = user.first_name || user.full_name?.split(' ')[0] || 'Rider';

  // Greeting text in topbar
  const greetEl = document.getElementById('greeting-text');
  if (greetEl) {
    greetEl.innerHTML = `${getGreetingWord()}, <em>${first}!</em> 👋`;
  }

  // Avatar initials
  const avatarEl = document.getElementById('user-avatar');
  if (avatarEl) {
    avatarEl.textContent = user.avatar || first.slice(0,2).toUpperCase();
  }

  // Dropdown menu details
  const nameEl  = document.getElementById('um-name');
  const emailEl = document.getElementById('um-email');
  const roleEl  = document.getElementById('um-role');
  if (nameEl)  nameEl.textContent  = user.full_name || first;
  if (emailEl) emailEl.textContent = user.email || '';
  if (roleEl)  roleEl.textContent  = user.role || 'rider';

  // Update sidebar footer
  const footerEl = document.querySelector('.system-status span');
  if (footerEl) footerEl.textContent = `${first}'s Fleet`;
}

function toggleUserMenu() {
  document.getElementById('user-menu')?.classList.toggle('open');
}

// Close menu on outside click
document.addEventListener('click', e => {
  const menu   = document.getElementById('user-menu');
  const avatar = document.getElementById('user-avatar');
  if (menu && avatar && !menu.contains(e.target) && !avatar.contains(e.target)) {
    menu.classList.remove('open');
  }
});

function handleLogout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.location.href = '/login';
}

// ── UTILITY ──────────────────────────────────────────────────────────────────

async function apiFetch(path, opts = {}) {
  try {
    const r = await fetch(API + path, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    toast("API Error: " + e.message);
    return null;
  }
}

function post(path, body) {
  return apiFetch(path, { method: "POST", body: JSON.stringify(body) });
}

function toast(msg, dur = 3500) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), dur);
}

function hide(id) { document.getElementById(id)?.classList.add("hidden"); }
function show(id) { document.getElementById(id)?.classList.remove("hidden"); }

function fmt(n, dec = 1) { return Number(n).toFixed(dec); }
function fmtUGX(n) { return "UGX " + Math.round(n).toLocaleString(); }

// ── CLOCK ─────────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2,"0");
  const m = String(now.getMinutes()).padStart(2,"0");
  const s = String(now.getSeconds()).padStart(2,"0");
  const el = document.getElementById("clock");
  if (el) el.textContent = `${h}:${m}:${s}`;
}
setInterval(updateClock, 1000);
updateClock();

// ── NAVIGATION ───────────────────────────────────────────────────────────────
const VIEW_TITLES = {
  dashboard:   "Overview Dashboard",
  routing:     "Incline-Aware Routing",
  jam:         "Kampala Jam Predictor",
  road:        "Accelerometer Road Quality",
  fuel:        "Fuel-to-Weight Optimizer",
  maintenance: "Predictive Maintenance AI",
  dem:         "Digital Elevation Model",
  audit:       "Fuel Audit Dashboard",
};

function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  const view = document.getElementById("view-" + name);
  if (view) view.classList.add("active");
  document.querySelector(`[data-view="${name}"]`)?.classList.add("active");
  document.getElementById("page-title").textContent = VIEW_TITLES[name] || name;

  // Lazy-load on first visit
  if (!view?._loaded) {
    if (name === "dashboard")   loadDashboard();
    if (name === "routing")     loadRoutingNodes();
    if (name === "jam")         loadJamAreas();
    if (name === "fuel")        loadBikes();
    if (name === "road")        loadRoadSim();
    if (name === "maintenance") loadFleetHealth();
    if (name === "audit")       loadAuditDashboard();
    if (view) view._loaded = true;
  }

  // Mobile close
  document.getElementById("sidebar").classList.remove("open");

  // Resize map when routing view becomes visible
  if (name === "routing") {
    setTimeout(() => {
      if (_mbMap) { _mbMap.resize(); }
      else if (document.getElementById('mapbox-map')) initMapboxMap();
    }, 150);
  }
}

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  const heatmap = await apiFetch("/api/jam/heatmap?hour=8&dow=0");
  if (heatmap) renderJamHeatmapDashboard(heatmap.heatmap);
  renderFuelEffChart();
  renderRoadQualityChart();
}

function renderJamHeatmapDashboard(data) {
  const el = document.getElementById("jam-heatmap-chart");
  if (!el || !data) return;
  const items = data.slice(0, 20).sort((a,b) => b.level - a.level);
  const maxLevel = Math.max(...items.map(i => i.level));

  el.innerHTML = `<div style="display:flex;align-items:flex-end;gap:5px;height:120px;padding:0 4px">
    ${items.map(item => {
      const h = Math.round((item.level / maxLevel) * 100);
      const col = item.level > 0.75 ? "#E94560" : item.level > 0.5 ? "#F5A623" : item.level > 0.3 ? "#3B82F6" : "#2ECC71";
      return `<div title="${item.area}: ${item.label}" style="flex:1;height:${h}%;background:${col};border-radius:3px 3px 0 0;min-width:8px;opacity:.85;transition:opacity .2s;cursor:default" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.85"></div>`;
    }).join("")}
  </div>
  <div style="display:flex;gap:16px;padding:10px 4px 0;font-size:10px;font-family:var(--mono);color:var(--muted)">
    <span style="color:#2ECC71">● Low</span>
    <span style="color:#3B82F6">● Moderate</span>
    <span style="color:#F5A623">● High</span>
    <span style="color:#E94560">● Gridlock</span>
    <span style="margin-left:auto">Morning peak · Mon</span>
  </div>`;
}

function renderFuelEffChart() {
  const el = document.getElementById("fuel-eff-chart");
  if (!el) return;
  const data = Array.from({length: 20}, (_,i) => ({ kpl: 25 + Math.random()*30 }));
  const max = Math.max(...data.map(d => d.kpl));
  el.innerHTML = `<div class="mini-bars">
    ${data.map(d => {
      const h = Math.round((d.kpl / max) * 100);
      const col = d.kpl > 42 ? "#2ECC71" : d.kpl > 32 ? "#F5A623" : "#E94560";
      return `<div class="mini-bar" style="height:${h}%;background:${col}" title="${fmt(d.kpl)} km/L"></div>`;
    }).join("")}
  </div>
  <div style="font-size:10px;color:var(--muted);font-family:var(--mono);padding-top:8px">Efficiency per rider · baseline 30 km/L</div>`;
}

function renderRoadQualityChart() {
  const el = document.getElementById("road-quality-chart");
  if (!el) return;
  const labels = ["Smooth","Moderate","Rough","Potholed"];
  const vals   = [35, 28, 22, 15];
  const cols   = ["#2ECC71","#3B82F6","#F5A623","#E94560"];
  const total  = vals.reduce((a,b) => a+b, 0);
  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;padding:4px 0">
    ${labels.map((l,i) => {
      const pct = Math.round(vals[i] / total * 100);
      return `<div>
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;font-family:var(--mono)">
          <span style="color:var(--text2)">${l}</span><span style="color:${cols[i]}">${pct}%</span>
        </div>
        <div style="height:6px;background:var(--bg3);border-radius:3px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:${cols[i]};border-radius:3px"></div>
        </div>
      </div>`;
    }).join("")}
  </div>`;
}

// ── ROUTING + MAPBOX GL JS NAVIGATION ────────────────────────────────────────

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZW1tYWRlcnJpY2siLCJhIjoiY21uaW80NjltMGVhejJvcXNzN2JzeWprciJ9.7H9SbTPJ_Kz56uDTx7_-Aw';

let _mbMap        = null;
let _nodeData     = {};
let _mbSources    = [];   // source ids added to map

const ROUTE_COLORS = {
  eco:           { color: '#2ECC71', label: '🌿 Eco',          width: 5 },
  fastest:       { color: '#3B82F6', label: '⚡ Fastest',       width: 4 },
  safest:        { color: '#A855F7', label: '🛡 Safest',        width: 4 },
  incline_aware: { color: '#F5A623', label: '⛰ Incline-Aware', width: 4 },
  mapbox:        { color: '#E94560', label: '🗺 Mapbox Route',  width: 6 },
};

// ── MAP INIT ──────────────────────────────────────────────────────────────────
function initMapboxMap() {
  if (_mbMap || !document.getElementById('mapbox-map')) return;

  mapboxgl.accessToken = MAPBOX_TOKEN;
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

  _mbMap = new mapboxgl.Map({
    container:  'mapbox-map',
    style:      isDark
      ? 'mapbox://styles/mapbox/dark-v11'
      : 'mapbox://styles/mapbox/streets-v12',
    center:     [32.5825, 0.3200],   // Kampala [lng, lat]
    zoom:       12,
    attributionControl: true,
  });

  // Navigation controls
  _mbMap.addControl(new mapboxgl.NavigationControl(), 'top-right');
  _mbMap.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-right');
  _mbMap.addControl(new mapboxgl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true,
  }), 'top-right');

  _mbMap.on('load', () => {
    // Add Kampala node dots layer
    const features = Object.entries(_nodeData)
      .filter(([, n]) => n.lat !== 0.33)
      .map(([name, n]) => ({
        type: 'Feature',
        properties: { name, elevation: n.elevation },
        geometry: { type: 'Point', coordinates: [n.lon, n.lat] },
      }));

    if (features.length) {
      _mbMap.addSource('kampala-nodes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      });
      _mbMap.addLayer({
        id: 'kampala-nodes-circle',
        type: 'circle',
        source: 'kampala-nodes',
        paint: {
          'circle-radius': 5,
          'circle-color': '#F5A623',
          'circle-opacity': 0.6,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fff',
        },
      });
      _mbMap.addLayer({
        id: 'kampala-nodes-label',
        type: 'symbol',
        source: 'kampala-nodes',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 10,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
        },
        paint: { 'text-color': '#F5A623', 'text-halo-color': '#000', 'text-halo-width': 1 },
      });
      _mbSources.push('kampala-nodes');
    }

    document.getElementById('map-status').textContent =
      `${Object.keys(_nodeData).length} nodes · Mapbox`;
  });

  // Popup on node click
  _mbMap.on('click', 'kampala-nodes-circle', (e) => {
    const props = e.features[0].properties;
    new mapboxgl.Popup({ className: 'mbx-popup' })
      .setLngLat(e.features[0].geometry.coordinates)
      .setHTML(`<b>${props.name}</b><br>Elevation: ${props.elevation}m`)
      .addTo(_mbMap);
  });
  _mbMap.on('mouseenter', 'kampala-nodes-circle', () => { _mbMap.getCanvas().style.cursor = 'pointer'; });
  _mbMap.on('mouseleave', 'kampala-nodes-circle', () => { _mbMap.getCanvas().style.cursor = ''; });
}

function updateMapTheme() {
  if (!_mbMap) return;
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  _mbMap.setStyle(isDark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12');
}

// ── CLEAR MAP ─────────────────────────────────────────────────────────────────
function clearMapRoutes() {
  if (_mbMap) {
    // Remove all route layers and sources we added
    const toRemove = _mbSources.filter(id => id !== 'kampala-nodes');
    toRemove.forEach(id => {
      try { _mbMap.removeLayer(id + '-layer'); } catch(e) {}
      try { _mbMap.removeLayer(id + '-casing'); } catch(e) {}
      try { _mbMap.removeLayer(id + '-arrows'); } catch(e) {}
      try { _mbMap.removeSource(id); } catch(e) {}
    });
    _mbSources = _mbSources.filter(id => id === 'kampala-nodes');

    // Remove markers
    document.querySelectorAll('.mbx-marker').forEach(el => el.remove());
  }

  document.getElementById('route-comparison').innerHTML = '';
  document.getElementById('route-map').innerHTML = '';
  document.getElementById('directions-panel').innerHTML =
    '<div style="color:var(--text2);font-size:12px;font-family:var(--mono);text-align:center;padding:20px 0">Select origin &amp; destination, then click Navigate</div>';
  const dc = document.getElementById('dir-count');
  const sc = document.getElementById('stops-count');
  if (dc) dc.textContent = '—';
  if (sc) sc.textContent = '—';
  hide('route-result');
}

// ── ADD ROUTE LINE TO MAPBOX ──────────────────────────────────────────────────
function addMapboxRoute(coordinates, sourceId, color, width, opacity = 1) {
  if (!_mbMap || !_mbMap.isStyleLoaded()) return;

  const geojson = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates },
  };

  // Remove if already exists
  try { _mbMap.removeLayer(sourceId + '-layer'); } catch(e) {}
  try { _mbMap.removeLayer(sourceId + '-casing'); } catch(e) {}
  try { _mbMap.removeSource(sourceId); } catch(e) {}

  _mbMap.addSource(sourceId, { type: 'geojson', data: geojson });

  // White casing (road outline effect)
  _mbMap.addLayer({
    id: sourceId + '-casing',
    type: 'line',
    source: sourceId,
    paint: { 'line-color': '#ffffff', 'line-width': width + 3, 'line-opacity': opacity * 0.4 },
    layout: { 'line-join': 'round', 'line-cap': 'round' },
  });
  // Coloured route
  _mbMap.addLayer({
    id: sourceId + '-layer',
    type: 'line',
    source: sourceId,
    paint: { 'line-color': color, 'line-width': width, 'line-opacity': opacity },
    layout: { 'line-join': 'round', 'line-cap': 'round' },
  });

  if (!_mbSources.includes(sourceId)) _mbSources.push(sourceId);
}

// ── ADD MARKER ────────────────────────────────────────────────────────────────
function addMapboxMarker(lngLat, color, label, popupHtml) {
  const el = document.createElement('div');
  el.className = 'mbx-marker';
  el.style.cssText = `
    width:18px;height:18px;border-radius:50%;
    background:${color};border:2.5px solid #fff;
    box-shadow:0 2px 10px rgba(0,0,0,.4);
    cursor:pointer;
    display:flex;align-items:center;justify-content:center;
    font-size:9px;font-weight:800;color:#000;
  `;
  el.textContent = label;

  const marker = new mapboxgl.Marker({ element: el })
    .setLngLat(lngLat)
    .addTo(_mbMap);

  if (popupHtml) {
    const popup = new mapboxgl.Popup({ offset: 12, className: 'mbx-popup' })
      .setHTML(popupHtml);
    marker.setPopup(popup);
  }
  return marker;
}

// ── MAPBOX DIRECTIONS API ─────────────────────────────────────────────────────
async function fetchMapboxDirections(originNode, destNode, profile = 'driving') {
  const on = _nodeData[originNode];
  const dn = _nodeData[destNode];
  if (!on || !dn || on.lat === 0.33) return null;

  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/` +
    `${on.lon},${on.lat};${dn.lon},${dn.lat}` +
    `?steps=true&geometries=geojson&overview=full&annotations=duration,distance,speed` +
    `&banner_instructions=true&voice_instructions=true` +
    `&access_token=${MAPBOX_TOKEN}`;

  try {
    const r = await fetch(url);
    if (!r.ok) { console.warn('Mapbox Directions HTTP', r.status); return null; }
    const d = await r.json();
    return d.routes?.[0] || null;
  } catch(e) {
    console.warn('Mapbox Directions error:', e);
    return null;
  }
}

// ── RENDER MAPBOX DIRECTIONS ──────────────────────────────────────────────────
function renderMapboxDirections(route, originName, destName) {
  if (!route) return;

  // Draw the route on the map
  const coords = route.geometry.coordinates;
  addMapboxRoute(coords, 'mapbox-nav', ROUTE_COLORS.mapbox.color, ROUTE_COLORS.mapbox.width);

  // Fit bounds
  const bounds = coords.reduce(
    (b, c) => b.extend(c),
    new mapboxgl.LngLatBounds(coords[0], coords[0])
  );
  _mbMap.fitBounds(bounds, { padding: { top: 50, bottom: 50, left: 50, right: 50 } });

  // Start / end markers
  addMapboxMarker(coords[0], '#2ECC71', 'A',
    `<b>Start</b><br>${originName}`);
  addMapboxMarker(coords[coords.length - 1], '#E94560', 'B',
    `<b>End</b><br>${destName}`);

  // Build turn-by-turn panel
  const steps = route.legs.flatMap(leg => leg.steps);
  const el = document.getElementById('directions-panel');
  const dc = document.getElementById('dir-count');
  if (!el) return;
  if (dc) dc.textContent = `${steps.length} steps`;

  const ICONS = {
    depart: '🚦', arrive: '📍', turn: '↱',
    'new name': '↑', continue: '↑', merge: '⤵',
    'on ramp': '↗', 'off ramp': '↘', fork: '⑂',
    roundabout: '⟳', rotary: '⟳', uturn: '⟲',
  };
  const modIcon = { left: '↰', right: '↱', 'sharp left': '↺', 'sharp right': '↻',
                    straight: '↑', uturn: '⟲', 'slight left': '↖', 'slight right': '↗' };

  function stepIcon(step) {
    const t = step.maneuver?.type || 'continue';
    const m = step.maneuver?.modifier || '';
    if (t === 'depart') return '🚦';
    if (t === 'arrive') return '📍';
    return modIcon[m] || ICONS[t] || '↑';
  }

  el.innerHTML = `
    <div style="background:rgba(233,69,96,.10);border:1px solid rgba(233,69,96,.3);border-radius:8px;padding:10px 12px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-weight:700;font-size:13px;color:var(--text)">${originName} → ${destName}</div>
        <div style="font-size:11px;color:var(--text2);font-family:var(--mono);margin-top:3px">
          ${(route.distance/1000).toFixed(1)} km · ${Math.round(route.duration/60)} min
        </div>
      </div>
      <div style="font-size:24px">🗺️</div>
    </div>
    ${steps.map((step, i) => {
      const isFirst = i === 0, isLast = i === steps.length - 1;
      const icon    = stepIcon(step);
      const name    = step.name || (isFirst ? originName : isLast ? destName : '');
      const dist    = step.distance;
      const dur     = step.duration;
      const type    = step.maneuver?.type || '';
      const mod     = step.maneuver?.modifier ? ' ' + step.maneuver.modifier : '';
      const action  = isFirst ? `Depart from <b>${originName}</b>`
                    : isLast  ? `Arrive at <b>${destName}</b>`
                    : `${(type + mod).trim() || 'Continue'}${name ? ' on <b>' + name + '</b>' : ''}`;
      return `<div class="direction-step">
        <div class="dir-icon ${isFirst?'start':isLast?'end':'turn'}">${icon}</div>
        <div class="dir-body">
          <div class="dir-text">${action}</div>
          ${name && !isFirst && !isLast ? `<div class="dir-meta">📍 ${name}</div>` : ''}
        </div>
        ${dist > 0 ? `<div class="dir-dist">
          ${dist >= 1000 ? (dist/1000).toFixed(1)+' km' : Math.round(dist)+' m'}
          <br><span style="color:var(--text3)">${dur < 60 ? Math.round(dur)+'s' : Math.round(dur/60)+'m'}</span>
        </div>` : ''}
      </div>`;
    }).join('')}`;

  document.getElementById('map-status').textContent = `🗺 Mapbox · ${(route.distance/1000).toFixed(1)} km`;
  toast(`✅ Route: ${(route.distance/1000).toFixed(1)} km · ${Math.round(route.duration/60)} min`);
}

// ── INTERNAL ROUTE OVERLAY ────────────────────────────────────────────────────
function drawInternalRoute(routeNodes, mode, isMain = true) {
  if (!_mbMap || !_mbMap.isStyleLoaded() || !routeNodes.length) return;
  const cfg   = ROUTE_COLORS[mode] || ROUTE_COLORS.eco;
  const coords = routeNodes.filter(n => n.lat !== 0.33).map(n => [n.lon, n.lat]);
  if (coords.length < 2) return;

  const sourceId = `internal-${mode}-${Date.now()}`;
  addMapboxRoute(coords, sourceId, cfg.color, isMain ? 4 : 2.5, isMain ? 0.7 : 0.4);

  if (isMain) {
    addMapboxMarker(coords[0], '#2ECC71', 'A',
      `<b>Start:</b> ${routeNodes[0]?.name}<br>Elev: ${Math.round(routeNodes[0]?.elevation)}m`);
    addMapboxMarker(coords[coords.length-1], '#E94560', 'B',
      `<b>End:</b> ${routeNodes[routeNodes.length-1]?.name}<br>Elev: ${Math.round(routeNodes[routeNodes.length-1]?.elevation)}m`);

    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new mapboxgl.LngLatBounds(coords[0], coords[0])
    );
    _mbMap.fitBounds(bounds, { padding: 60 });
  }
}

// ── LOAD NODES ────────────────────────────────────────────────────────────────
async function loadRoutingNodes() {
  const data = await apiFetch('/api/routing/nodes');
  if (!data) return;

  data.nodes.forEach(name => {
    _nodeData[name] = { lat: 0.33, lon: 32.58, elevation: 1200 };
  });

  ['r-origin', 'r-dest'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = data.nodes.map(n => `<option value="${n}">${n}</option>`).join('');
  });
  const dest = document.getElementById('r-dest');
  if (dest) dest.selectedIndex = 5;

  setTimeout(() => initMapboxMap(), 120);
}

// ── NAVIGATE (Mapbox Directions + internal overlay) ───────────────────────────
async function doNavigate() {
  const originName = document.getElementById('r-origin').value;
  const destName   = document.getElementById('r-dest').value;
  const body = {
    origin: originName, destination: destName,
    mode:            document.getElementById('r-mode').value,
    rider_weight_kg: +document.getElementById('r-rider-w').value,
    load_kg:         +document.getElementById('r-load').value,
    fuel_liters:     +document.getElementById('r-fuel').value,
  };

  toast('🗺 Fetching Mapbox route…');
  clearMapRoutes();
  if (!_mbMap) initMapboxMap();

  // 1. Get internal Bodaify analytics route
  const data = await post('/api/routing/calculate', body);
  if (!data) return;
  data.route.forEach(n => { _nodeData[n.name] = n; });

  renderRouteResult(data);
  renderRouteSteps(data.route);
  sbLogRoute(data);

  // Show directions loading
  document.getElementById('directions-panel').innerHTML =
    '<div style="text-align:center;padding:20px;font-family:var(--mono);font-size:12px;color:var(--text2)">⏳ Fetching Mapbox directions…</div>';

  // 2. Wait for map style to load, then draw
  const drawWhenReady = async () => {
    // Draw internal route (analytics layer)
    drawInternalRoute(data.route, body.mode, true);

    // 3. Fetch real Mapbox Directions
    const mbxRoute = await fetchMapboxDirections(originName, destName, 'driving');
    if (mbxRoute) {
      renderMapboxDirections(mbxRoute, originName, destName);
    } else {
      // Fallback: use internal route for directions panel
      renderFallbackDirections(data.route, originName, destName);
      toast('Navigation ready (Mapbox offline — using internal route)');
    }
  };

  if (_mbMap.isStyleLoaded()) {
    await drawWhenReady();
  } else {
    _mbMap.once('load', drawWhenReady);
  }
}

// ── COMPARE ALL ROUTES ────────────────────────────────────────────────────────
async function calculateAllRoutes() {
  const origin = document.getElementById('r-origin').value;
  const dest   = document.getElementById('r-dest').value;
  const base   = {
    origin, destination: dest,
    rider_weight_kg: +document.getElementById('r-rider-w').value,
    load_kg:         +document.getElementById('r-load').value,
    fuel_liters:     +document.getElementById('r-fuel').value,
  };

  toast('Calculating all 4 routes…');
  clearMapRoutes();
  if (!_mbMap) initMapboxMap();

  const modes   = ['eco', 'fastest', 'safest', 'incline_aware'];
  const results = await Promise.all(modes.map(m => post('/api/routing/calculate', { ...base, mode: m })));
  const valid   = results.map((r, i) => ({ mode: modes[i], data: r })).filter(x => x.data);

  const drawAll = async () => {
    valid.forEach((r, i) => {
      r.data.route.forEach(n => { _nodeData[n.name] = n; });
      drawInternalRoute(r.data.route, r.mode, i === 0);
    });

    // Also fetch Mapbox real route
    const mbxRoute = await fetchMapboxDirections(origin, dest, 'driving');
    if (mbxRoute) renderMapboxDirections(mbxRoute, origin, dest);

    addMapboxLegend(valid.map(r => r.mode));
  };

  renderComparisonTable(valid);
  if (valid[0]) { renderRouteResult(valid[0].data); renderRouteSteps(valid[0].data.route); }

  if (_mbMap.isStyleLoaded()) { await drawAll(); }
  else { _mbMap.once('load', drawAll); }
}

// ── MAP LEGEND ────────────────────────────────────────────────────────────────
function addMapboxLegend(modes) {
  // Remove existing
  document.getElementById('mbx-legend')?.remove();
  const mapEl = document.getElementById('mapbox-map');
  if (!mapEl) return;

  const div = document.createElement('div');
  div.id = 'mbx-legend';
  div.style.cssText = `
    position:absolute;bottom:36px;left:12px;z-index:10;
    background:rgba(10,12,16,.88);border:1px solid #252930;border-radius:8px;
    padding:10px 14px;font-family:JetBrains Mono,monospace;font-size:11px;
    color:#D8DCE8;backdrop-filter:blur(8px);pointer-events:none;
  `;
  div.innerHTML = `<div style="font-weight:700;margin-bottom:6px;color:#F5A623">ROUTES</div>
    <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px">
      <div style="width:24px;height:4px;background:#E94560;border-radius:2px"></div><span>🗺 Mapbox Navigation</span>
    </div>` +
    modes.map(m => {
      const c = ROUTE_COLORS[m];
      return `<div style="display:flex;align-items:center;gap:7px;margin-bottom:4px">
        <div style="width:24px;height:3px;background:${c.color};border-radius:2px;opacity:.7"></div><span>${c.label}</span>
      </div>`;
    }).join('');
  mapEl.appendChild(div);
}

// ── ROUTE STEPS (sidebar) ────────────────────────────────────────────────────
function renderRouteSteps(nodes) {
  const el = document.getElementById('route-map');
  const sc = document.getElementById('stops-count');
  if (!el) return;
  if (sc) sc.textContent = `${nodes.length} stops`;
  el.innerHTML = `<div class="route-steps">
    ${nodes.map((n, i) => `
      ${i > 0 ? '<div class="step-connector"></div>' : ''}
      <div class="route-step">
        <div class="step-badge">${i+1}</div>
        <span class="step-name" style="font-size:11px">${n.name}</span>
        <span class="step-elev">${Math.round(n.elevation)}m</span>
        <span class="step-grade ${n.grade > 4 ? 'steep' : 'flat'}">${fmt(n.grade,1)}%</span>
      </div>`).join('')}
  </div>`;
}

// ── FALLBACK DIRECTIONS ───────────────────────────────────────────────────────
function renderFallbackDirections(nodes, originName, destName) {
  const el = document.getElementById('directions-panel');
  const dc = document.getElementById('dir-count');
  if (!el) return;
  if (dc) dc.textContent = `${nodes.length} waypoints`;
  const icons = ['🚦','↑','↱','↰','↑','↗','↘','📍'];
  el.innerHTML = `
    <div style="background:rgba(245,166,35,.10);border:1px solid rgba(245,166,35,.25);border-radius:8px;padding:9px 12px;margin-bottom:10px;font-family:var(--mono);font-size:11px;color:var(--accent)">
      ℹ Mapbox offline — showing route waypoints
    </div>
    ${nodes.map((n,i) => {
      const iF = i===0, iL = i===nodes.length-1;
      return `<div class="direction-step">
        <div class="dir-icon ${iF?'start':iL?'end':'turn'}">${iF?'🚦':iL?'📍':icons[i%icons.length]}</div>
        <div class="dir-body">
          <div class="dir-text">${iF?'Depart from':iL?'Arrive at':'Pass through'} <b>${n.name}</b></div>
          <div class="dir-meta">Elev: ${Math.round(n.elevation)}m · Grade: ${fmt(n.grade,1)}%</div>
        </div>
      </div>`;
    }).join('')}`;
}

// ── COMPARISON TABLE ──────────────────────────────────────────────────────────
function renderComparisonTable(routes) {
  const el = document.getElementById('route-comparison');
  if (!el) return;
  el.innerHTML = `<table class="fuel-table" style="margin-top:4px">
    <thead><tr><th>Mode</th><th>Distance</th><th>Time</th><th>Fuel Cost</th><th>Incline</th><th>Stops</th><th>CO₂ Saved</th></tr></thead>
    <tbody>${routes.map(r => {
      const c = ROUTE_COLORS[r.mode], d = r.data;
      return `<tr>
        <td><span style="display:inline-flex;align-items:center;gap:7px">
          <span style="width:10px;height:10px;border-radius:50%;background:${c.color};display:inline-block"></span>${c.label}
        </span></td>
        <td>${fmt(d.total_distance_km)} km</td>
        <td>${fmt(d.estimated_time_min)} min</td>
        <td style="color:var(--accent)">${fmtUGX(d.fuel_cost_ugx)}</td>
        <td style="color:${d.incline_score>40?'var(--accent2)':'var(--green)'}">${fmt(d.incline_score)}/100</td>
        <td>${d.route.length}</td>
        <td style="color:var(--green)">${fmt(d.co2_saved_g)} g</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

function renderRouteResult(d) {
  show('route-result');
  document.getElementById('route-result').innerHTML = `
    <div class="result-grid">
      <div class="result-kv"><span class="rk">Distance</span><span class="rv">${fmt(d.total_distance_km)} km</span></div>
      <div class="result-kv"><span class="rk">Est. Time</span><span class="rv">${fmt(d.estimated_time_min)} min</span></div>
      <div class="result-kv"><span class="rk">Fuel Cost</span><span class="rv">${fmtUGX(d.fuel_cost_ugx)}</span></div>
      <div class="result-kv"><span class="rk">Incline Score</span><span class="rv ${d.incline_score>40?'red':'green'}">${fmt(d.incline_score)}/100</span></div>
      <div class="result-kv"><span class="rk">CO₂ Saved</span><span class="rv green">${fmt(d.co2_saved_g)} g</span></div>
      <div class="result-kv"><span class="rk">Stops</span><span class="rv">${d.route.length}</span></div>
    </div>
    <div class="recommendation">💡 ${d.recommendation}</div>`;
}

// ── JAM PREDICTOR ─────────────────────────────────────────────────────────────

async function loadJamAreas() {
  const data = await apiFetch("/api/jam/areas");
  if (!data) return;
  const sel = document.getElementById("j-area");
  if (sel) sel.innerHTML = data.areas.map(a => `<option value="${a}">${a}</option>`).join("");
}

async function predictJam() {
  const area = document.getElementById("j-area").value;
  const hour = +document.getElementById("j-hour").value;
  const dow  = +document.getElementById("j-day").value;
  toast("Predicting jam…");
  const data = await post("/api/jam/predict", { area, hour_of_day: hour, day_of_week: dow });
  if (!data) return;
  renderJamResult(data);
  loadWeeklyForecast(area);
}

function renderJamResult(d) {
  show("jam-result");
  const lvl   = d.congestion_level;
  const cls   = lvl < 0.3 ? "level-low" : lvl < 0.55 ? "level-mod" : lvl < 0.80 ? "level-high" : "level-grid";
  const col   = lvl < 0.3 ? "#2ECC71"   : lvl < 0.55 ? "#3B82F6"   : lvl < 0.80 ? "#F5A623"    : "#E94560";
  const pct   = Math.round(lvl * 100);
  document.getElementById("jam-result").innerHTML = `
    <div class="result-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="result-kv"><span class="rk">Area</span><span class="rv" style="font-size:14px">${d.area}</span></div>
      <div class="result-kv"><span class="rk">Avg Speed</span><span class="rv">${fmt(d.avg_speed_kmh)} km/h</span></div>
      <div class="result-kv"><span class="rk">Clears By</span><span class="rv" style="font-size:14px">${d.predicted_clear}</span></div>
    </div>
    <div class="congestion-meter">
      <div class="congestion-bar-wrap"><div class="congestion-bar-fill" style="width:${pct}%;background:${col}"></div></div>
      <span class="congestion-label-badge ${cls}">${d.label}</span>
      <span style="font-family:var(--mono);font-size:12px;color:var(--text2)">${pct}%</span>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      ${d.hotspots.map((h,i) => `
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:8px 12px;font-family:var(--mono);font-size:11px">
          <div style="color:var(--text2);margin-bottom:2px">${h.label}</div>
          <div style="color:${h.severity > 0.7 ? "var(--accent2)" : "var(--accent)"}">Severity ${Math.round(h.severity*100)}%</div>
          <div style="color:var(--muted);font-size:10px">${h.lat.toFixed(4)}, ${h.lon.toFixed(4)}</div>
        </div>`).join("")}
    </div>`;
}

async function loadWeeklyForecast(area) {
  const data = await apiFetch(`/api/jam/weekly/${encodeURIComponent(area)}`);
  if (!data) return;
  show("jam-weekly");
  renderWeeklyHeatmap(data.forecast);
}

function renderWeeklyHeatmap(forecast) {
  const el = document.getElementById("jam-weekly");
  if (!el) return;
  const days  = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const hours = [0,3,6,9,12,15,18,21];

  let html = `<div style="font-family:var(--mono);font-size:11px">
    <div style="color:var(--text2);margin-bottom:10px;font-size:12px">Weekly Congestion Forecast</div>
    <div style="display:grid;grid-template-columns:32px repeat(7,1fr);gap:3px;align-items:center">
      <div></div>
      ${days.map(d => `<div style="text-align:center;color:var(--muted);font-size:9px">${d}</div>`).join("")}
      ${hours.map(h => `
        <div style="color:var(--muted);font-size:9px;text-align:right;padding-right:6px">${String(h).padStart(2,"0")}</div>
        ${days.map((_,di) => {
          const entry = forecast.find(f => f.hour === h && f.day === days[di]);
          const lvl   = entry ? entry.level : 0;
          const col   = lvl < 0.3 ? "#2ECC71" : lvl < 0.55 ? "#3B82F6" : lvl < 0.80 ? "#F5A623" : "#E94560";
          return `<div style="height:22px;border-radius:3px;background:${col};opacity:${0.2 + lvl*0.8}" title="${days[di]} ${h}:00 — ${Math.round(lvl*100)}%"></div>`;
        }).join("")}
      `).join("")}
    </div>
  </div>`;
  el.innerHTML = html;
}

// ── ROAD QUALITY ─────────────────────────────────────────────────────────────
async function loadRoadSim() {
  const data = await apiFetch("/api/road-quality/simulate");
  if (!data) return;
  renderRoadQualitySim(data.segments);
}

function renderRoadQualitySim(segs) {
  const el = document.getElementById("road-map-sim");
  if (!el) return;
  const sorted = segs.sort((a,b) => b.rqi - a.rqi);
  el.innerHTML = `
    <div style="font-family:var(--mono);font-size:11px;color:var(--text2);margin-bottom:10px;padding-left:16px">
      Kampala Road Quality Map (Simulated) · ${segs.length} segments
    </div>
    <div class="rq-grid">
    ${sorted.map(s => {
      const col = s.rqi >= 80 ? "#2ECC71" : s.rqi >= 60 ? "#3B82F6" : s.rqi >= 35 ? "#F5A623" : "#E94560";
      const bg  = s.rqi >= 80 ? "rgba(46,204,113,.2)" : s.rqi >= 60 ? "rgba(59,130,246,.2)" : s.rqi >= 35 ? "rgba(245,166,35,.2)" : "rgba(233,69,96,.2)";
      return `<div class="rq-dot" style="background:${bg};color:${col}" title="${s.area}: RQI ${s.rqi} (${s.condition})">${Math.round(s.rqi)}</div>`;
    }).join("")}
    </div>
    <div style="display:flex;gap:16px;padding:0 16px 10px;font-size:10px;font-family:var(--mono);color:var(--muted)">
      <span style="color:#2ECC71">● Smooth (≥80)</span>
      <span style="color:#3B82F6">● Moderate (≥60)</span>
      <span style="color:#F5A623">● Rough (≥35)</span>
      <span style="color:#E94560">● Potholed (&lt;35)</span>
    </div>`;
}

async function analyzeRoad() {
  const body = {
    lat: +document.getElementById("rq-lat").value,
    lon: +document.getElementById("rq-lon").value,
    ax:  +document.getElementById("rq-ax").value,
    ay:  +document.getElementById("rq-ay").value,
    az:  +document.getElementById("rq-az").value,
    speed_kmh: +document.getElementById("rq-spd").value,
  };
  toast("Analyzing reading…");
  const data = await post("/api/road-quality/analyze", body);
  if (!data) return;
  const colMap = { smooth:"#2ECC71", moderate:"#3B82F6", rough:"#F5A623", potholed:"#E94560" };
  const col = colMap[data.condition] || "#F5A623";
  show("road-result");
  document.getElementById("road-result").innerHTML = `
    <div class="result-grid">
      <div class="result-kv"><span class="rk">RQI Score</span><span class="rv" style="color:${col}">${fmt(data.rqi)}/100</span></div>
      <div class="result-kv"><span class="rk">Condition</span><span class="rv" style="color:${col};font-size:16px;text-transform:capitalize">${data.condition}</span></div>
      <div class="result-kv"><span class="rk">Vibration</span><span class="rv">${fmt(data.vibration,3)} m/s²</span></div>
    </div>
    <div class="recommendation">📍 Segment <b>${data.segment}</b> — ${
      data.rqi >= 80 ? "Road is in excellent condition. No concern." :
      data.rqi >= 60 ? "Minor surface irregularities. Moderate caution advised." :
      data.rqi >= 35 ? "Rough road. Reduce speed and cargo for rider comfort." :
      "Severely potholed. Avoid if possible — high bike wear risk."
    }</div>`;
}

// ── FUEL OPTIMIZER ────────────────────────────────────────────────────────────
async function loadBikes() {
  const data = await apiFetch("/api/fuel/bikes");
  if (!data) return;
  const sel = document.getElementById("f-bike");
  if (sel) sel.innerHTML = data.bikes.map(b => `<option value="${b.model}">${b.model} (${b.engine_cc}cc · ${b.base_kpl}km/L)</option>`).join("");
}

async function optimizeFuel() {
  const body = {
    bike_model:      document.getElementById("f-bike").value,
    rider_weight_kg: +document.getElementById("f-rider-w").value,
    load_kg:         +document.getElementById("f-load").value,
    fuel_liters:     +document.getElementById("f-fuel").value,
    distance_km:     +document.getElementById("f-dist").value,
    incline_avg:     +document.getElementById("f-incline").value,
  };
  toast("Computing fuel model…");
  const data = await post("/api/fuel/optimize", body);
  if (!data) return;
  show("fuel-result");
  document.getElementById("fuel-result").innerHTML = `
    <div style="display:flex;align-items:center;gap:20px;margin-bottom:16px">
      <div class="grade-badge grade-${data.efficiency_grade}">${data.efficiency_grade}</div>
      <div>
        <div style="font-size:20px;font-weight:800">${fmt(data.range_km)} km range</div>
        <div style="color:var(--text2);font-size:12px;font-family:var(--mono)">Total weight: ${fmt(data.total_weight_kg)} kg</div>
      </div>
    </div>
    <div class="result-grid">
      <div class="result-kv"><span class="rk">Fuel:Weight Ratio</span><span class="rv">${data.fuel_to_weight_ratio.toFixed(4)} L/kg/100km</span></div>
      <div class="result-kv"><span class="rk">Cost per km</span><span class="rv">${fmtUGX(data.cost_per_km_ugx)}</span></div>
      <div class="result-kv"><span class="rk">Optimal Load</span><span class="rv green">${data.optimal_load_kg} kg</span></div>
    </div>
    <div class="recommendation">💡 ${data.savings_tip}</div>`;
}

// ── MAINTENANCE ───────────────────────────────────────────────────────────────
async function analyzeMaintenance() {
  const body = {
    bike_id:          document.getElementById("m-id").value,
    mileage_km:       +document.getElementById("m-km").value,
    last_service_km:  +document.getElementById("m-svc-km").value,
    engine_hours:     +document.getElementById("m-hours").value,
    avg_vibration:    +document.getElementById("m-vib").value,
    brake_wear_pct:   +document.getElementById("m-brake").value,
    chain_stretch_mm: +document.getElementById("m-chain").value,
    tire_pressure_f:  +document.getElementById("m-tyre-f").value,
    tire_pressure_r:  +document.getElementById("m-tyre-r").value,
    oil_level_pct:    +document.getElementById("m-oil").value,
  };
  toast("Running diagnostics…");
  const data = await post("/api/maintenance/analyze", body);
  if (!data) return;
  show("maint-result");

  const hcol = data.health_score >= 70 ? "#2ECC71" : data.health_score >= 40 ? "#F5A623" : "#E94560";
  document.getElementById("maint-result").innerHTML = `
    <div style="display:flex;align-items:center;gap:20px;margin-bottom:16px">
      <div style="font-size:38px;font-weight:800;color:${hcol}">${fmt(data.health_score)}<span style="font-size:16px;color:var(--text2)">/100</span></div>
      <div>
        <div style="font-weight:700;font-size:15px">Bike ${data.bike_id}</div>
        <div style="color:var(--text2);font-size:12px;font-family:var(--mono)">
          Next service: ${Math.round(data.next_service_km).toLocaleString()} km ·
          Failure risk: ${Math.round(data.predicted_failure_risk * 100)}%
        </div>
      </div>
    </div>
    <div class="alert-list">
      ${data.alerts.map(a => `
        <div class="alert-item ${a.urgency}">
          <div class="alert-dot"></div>
          <div class="alert-body">
            <div class="alert-comp">${a.component}</div>
            <div class="alert-msg">${a.message}${a.cost_est_ugx ? ` · Est. ${fmtUGX(a.cost_est_ugx)}` : ""}</div>
          </div>
          <span style="font-size:10px;font-family:var(--mono);color:var(--muted);text-transform:uppercase">${a.urgency}</span>
        </div>`).join("")}
    </div>`;
}

async function loadFleetHealth() {
  const data = await apiFetch("/api/maintenance/fleet-status");
  if (!data) return;
  const el = document.getElementById("fleet-health");
  if (!el) return;
  const bikes = data.fleet;
  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px">
    ${bikes.slice(0,8).map(b => {
      const col = b.health >= 70 ? "#2ECC71" : b.health >= 40 ? "#F5A623" : "#E94560";
      return `<div style="display:flex;align-items:center;gap:10px;font-family:var(--mono);font-size:11px">
        <span style="color:var(--text2);width:72px">${b.bike_id}</span>
        <div style="flex:1;height:6px;background:var(--bg3);border-radius:3px;overflow:hidden">
          <div style="width:${b.health}%;height:100%;background:${col};border-radius:3px"></div>
        </div>
        <span style="color:${col};width:36px;text-align:right">${fmt(b.health)}</span>
        ${b.alerts > 0 ? `<span style="color:var(--accent2);font-size:10px">⚠ ${b.alerts}</span>` : `<span style="color:var(--green);font-size:10px">✓</span>`}
      </div>`;
    }).join("")}
  </div>`;
}

// ── DEM ───────────────────────────────────────────────────────────────────────
async function fetchDEM() {
  const lat1  = +document.getElementById("d-lat1").value;
  const lon1  = +document.getElementById("d-lon1").value;
  const lat2  = +document.getElementById("d-lat2").value;
  const lon2  = +document.getElementById("d-lon2").value;
  const steps = +document.getElementById("d-steps").value;
  toast("Fetching elevation profile…");
  const data = await apiFetch(`/api/dem/profile?lat1=${lat1}&lon1=${lon1}&lat2=${lat2}&lon2=${lon2}&steps=${steps}`);
  if (!data) return;
  show("dem-result");
  document.getElementById("dem-result").innerHTML = `
    <div class="result-grid">
      <div class="result-kv"><span class="rk">Min Elevation</span><span class="rv">${fmt(data.min_elevation)} m</span></div>
      <div class="result-kv"><span class="rk">Max Elevation</span><span class="rv">${fmt(data.max_elevation)} m</span></div>
      <div class="result-kv"><span class="rk">Total Climb</span><span class="rv red">↑ ${fmt(data.total_climb_m)} m</span></div>
      <div class="result-kv"><span class="rk">Total Descent</span><span class="rv green">↓ ${fmt(data.total_descent_m)} m</span></div>
      <div class="result-kv"><span class="rk">Avg Grade</span><span class="rv">${fmt(data.avg_grade)}%</span></div>
      <div class="result-kv"><span class="rk">Points</span><span class="rv">${data.points.length}</span></div>
    </div>`;
  renderDEMProfile(data.points);
}

function renderDEMProfile(points) {
  const el = document.getElementById("dem-chart");
  if (!el || !points.length) return;
  const W = el.clientWidth || 600, H = 200;
  const elevs   = points.map(p => p.elevation);
  const minE    = Math.min(...elevs), maxE = Math.max(...elevs);
  const padY    = 20, padX = 40;
  const innerW  = W - padX * 2, innerH = H - padY * 2;

  const xScale = i => padX + (i / (points.length - 1)) * innerW;
  const yScale = e => padY + innerH - ((e - minE) / ((maxE - minE) || 1)) * innerH;

  const pathD = points.map((p,i) => `${i === 0 ? "M" : "L"}${xScale(i)},${yScale(p.elevation)}`).join(" ");
  const fillD = `${pathD} L${xScale(points.length-1)},${padY+innerH} L${padX},${padY+innerH} Z`;

  const gradesColor = points.map(p => {
    if (p.grade > 6) return "#E94560";
    if (p.grade > 3) return "#F5A623";
    return "#2ECC71";
  });

  el.innerHTML = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="demGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#F5A623" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#F5A623" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    <path d="${fillD}" fill="url(#demGrad)"/>
    <path d="${pathD}" fill="none" stroke="#F5A623" stroke-width="2" stroke-linejoin="round"/>
    ${points.filter((_,i) => i % 5 === 0).map((_,i) => {
      const ri = i * 5;
      return `<line x1="${xScale(ri)}" y1="${padY}" x2="${xScale(ri)}" y2="${padY+innerH}" stroke="var(--border)" stroke-width="1"/>
              <text x="${xScale(ri)}" y="${H-4}" text-anchor="middle" class="dem-label">${ri}</text>`;
    }).join("")}
    <text x="8" y="${yScale(maxE)}" class="dem-label">${Math.round(maxE)}m</text>
    <text x="8" y="${yScale(minE)}" class="dem-label">${Math.round(minE)}m</text>
    ${points.map((p,i) => {
      const col = gradesColor[i];
      return `<circle cx="${xScale(i)}" cy="${yScale(p.elevation)}" r="3" fill="${col}" opacity="0.7">
        <title>${p.elevation}m · grade ${p.grade}%</title>
      </circle>`;
    }).join("")}
  </svg>
  <div style="display:flex;gap:16px;font-size:10px;font-family:var(--mono);color:var(--muted);padding-top:8px">
    <span style="color:#2ECC71">● &lt;3% grade</span>
    <span style="color:#F5A623">● 3–6% grade</span>
    <span style="color:#E94560">● &gt;6% grade</span>
  </div>`;
}

// ── FUEL AUDIT ────────────────────────────────────────────────────────────────
async function loadAuditDashboard() {
  const data = await apiFetch("/api/fuel-audit/dashboard");
  if (!data) return;
  renderAuditDashboard(data);
}

function renderAuditDashboard(data) {
  const el = document.getElementById("audit-dashboard");
  if (!el) return;
  const s = data.fleet_summary;
  el.innerHTML = `
    <div class="hero-stats" style="grid-template-columns:repeat(5,1fr)">
      <div class="stat-card"><div class="stat-icon">👤</div><div class="stat-value">${s.total_riders}</div><div class="stat-label">Riders</div></div>
      <div class="stat-card"><div class="stat-icon">⛽</div><div class="stat-value">${fmt(s.total_fuel_l)}</div><div class="stat-label">Total Litres</div></div>
      <div class="stat-card accent"><div class="stat-icon">📊</div><div class="stat-value">${fmt(s.avg_efficiency)}</div><div class="stat-label">Avg km/L</div></div>
      <div class="stat-card"><div class="stat-icon">💰</div><div class="stat-value">${(s.total_cost_ugx/1e6).toFixed(1)}M</div><div class="stat-label">Total Cost UGX</div></div>
      <div class="stat-card"><div class="stat-icon">⚠</div><div class="stat-value">${s.anomaly_count}</div><div class="stat-label">Anomalies</div></div>
    </div>
    <div class="panel">
      <div class="panel-header"><span class="panel-title">Rider Fuel Efficiency Ranking</span><span class="panel-badge">Top 20</span></div>
      <div style="overflow-x:auto">
        <table class="fuel-table">
          <thead><tr>
            <th>#</th><th>Rider ID</th><th>km/L</th><th>Litres</th><th>Distance</th><th>Cost</th><th>Anomalies</th><th>Trend</th>
          </tr></thead>
          <tbody>
            ${data.riders.slice(0,20).map((r,i) => `<tr>
              <td style="color:var(--muted)">${i+1}</td>
              <td style="font-weight:700">${r.rider_id}</td>
              <td style="color:${r.efficiency_kpl >= 40 ? "#2ECC71" : r.efficiency_kpl >= 30 ? "#F5A623" : "#E94560"};font-weight:700">${fmt(r.efficiency_kpl)}</td>
              <td>${fmt(r.liters)}</td>
              <td>${fmt(r.distance_km)} km</td>
              <td>${fmtUGX(r.cost_ugx)}</td>
              <td>${r.anomalies > 0 ? `<span class="anomaly-flag">⚠ ${r.anomalies}</span>` : '<span style="color:var(--green)">✓</span>'}</td>
              <td class="${r.trend === "improving" ? "trend-up" : r.trend === "worsening" ? "trend-down" : ""}">${r.trend}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;

  // Set today's date in form
  const dateEl = document.getElementById("a-date");
  if (dateEl) dateEl.value = new Date().toISOString().split("T")[0];
}

async function submitFuelEntry() {
  const body = {
    rider_id:    document.getElementById("a-rider").value,
    date:        document.getElementById("a-date").value,
    liters:      +document.getElementById("a-liters").value,
    cost_ugx:    +document.getElementById("a-cost").value,
    distance_km: +document.getElementById("a-dist").value,
    station:     document.getElementById("a-station").value,
  };
  toast("Submitting entry…");
  const data = await post("/api/fuel-audit/submit", body);
  if (!data) return;
  sbLogFuelEntry(body);
  show("audit-entry-result");
  document.getElementById("audit-entry-result").innerHTML = `
    <div class="result-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="result-kv"><span class="rk">Efficiency</span><span class="rv">${fmt(data.avg_efficiency_kpl)} km/L</span></div>
      <div class="result-kv"><span class="rk">Trend</span><span class="rv ${data.trend === "improving" ? "green" : data.trend === "worsening" ? "red" : ""}">${data.trend}</span></div>
      <div class="result-kv"><span class="rk">Fleet Rank</span><span class="rv">${fmt(data.rank_percentile)}%ile</span></div>
    </div>
    ${data.anomalies.length ? `<div class="recommendation" style="border-color:rgba(233,69,96,.25)">⚠ ${data.anomalies.join(" · ")}</div>` : '<div class="recommendation">✓ No anomalies detected in this entry.</div>'}`;
}

// ── THEME ─────────────────────────────────────────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute("data-theme") !== "light";
  const next = isDark ? "light" : "dark";
  html.setAttribute("data-theme", next);
  localStorage.setItem("bi-theme", next);
  const btn = document.getElementById("theme-btn");
  if (btn) btn.textContent = next === "light" ? "🌙" : "☀️";
  updateMapTheme();
}

function applyTheme() {
  const saved = localStorage.getItem("bi-theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  const btn = document.getElementById("theme-btn");
  if (btn) btn.textContent = saved === "light" ? "🌙" : "☀️";
}

// ── BOOT ───────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  applyTheme();
  await initSupabase();
  const authed = await checkAuth();
  if (!authed) return;
  showView("dashboard");
});
