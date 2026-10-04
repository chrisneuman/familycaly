'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

const CONFIG_DIR = path.resolve(process.env.CONFIG_DIR || path.join(__dirname, '..', 'config'));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 8080);

// ---- configuration -------------------------------------------------------

const configPath = path.join(CONFIG_DIR, 'family.json');
const DEMO = process.env.DEMO === '1' || process.argv.includes('--demo') || !fs.existsSync(configPath);
const demo = require('./demo');
const config = DEMO ? demo.config : JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Dates are bucketed into days on the server, so it must run in the family's timezone.
if (config.timezone) process.env.TZ = config.timezone;

const { cached, addDays, dayKey, parseKey } = require('./util');
const { loadEvents, loadMeals } = require('./calendar');
const { loadWeather } = require('./weather');
const { loadLunch } = require('./lunch');

function inkFor(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.36 ? '#1d1400' : '#ffffff';
}

const people = config.people.map((p) => ({
  id: p.id,
  name: p.name,
  color: p.color,
  ink: p.ink || inkFor(p.color),
  dog: Boolean(p.dog),
  photo: p.photo ? `/photos/${encodeURIComponent(p.photo)}` : null,
}));

const calendars = [];
for (const p of config.people) {
  for (const url of [].concat(p.ical || [])) calendars.push({ label: p.name, ical: url, people: [p.id] });
}
for (const c of config.sharedCalendars || []) calendars.push({ label: c.name || 'Shared', ical: c.ical, people: c.people });

console.log(DEMO
  ? `[config] demo mode (${fs.existsSync(configPath) ? 'requested' : `no ${configPath}`})`
  : `[config] ${people.length} people, ${calendars.length} calendars`);

// ---- data sources, cached --------------------------------------------------

const MIN = 60 * 1000;
const getEvents = cached(4 * MIN, async ({ from, to }) => {
  if (DEMO) return { events: demo.events(from, to), meals: demo.meals(from, to), errors: [] };
  const [ev, meals] = await Promise.all([
    loadEvents(calendars, from, to),
    config.meals && config.meals.ical ? loadMeals(config.meals.ical, from, to).catch(() => ({})) : {},
  ]);
  if (calendars.length && ev.errors.length === calendars.length) throw new Error(`all calendars failed: ${ev.errors.join('; ')}`);
  return { ...ev, meals };
});
const getWeather = cached(15 * MIN, () => (DEMO ? demo.weather() : loadWeather(config.location, config.units)));
// `lunch` can be one school or a list of them.
const schools = [].concat(config.lunch || []);
const getLunch = cached(60 * MIN, (i) => (DEMO ? demo.lunch(i) : loadLunch(schools[i])));

// ---- http ------------------------------------------------------------------

const TYPES = { '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json' };

// Everything the page needs comes from this server. Style attributes stay allowed
// because the screen sets each person's color inline.
const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
};

function send(res, status, body, type = 'application/json', extra = {}) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...SECURITY_HEADERS, ...extra });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

function serveFile(res, root, rel) {
  const file = path.join(root, path.normalize(rel).replace(/^([.][.][/\\])+/, ''));
  if (!file.startsWith(root + path.sep)) return send(res, 404, { error: 'not found' });
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, { error: 'not found' });
    send(res, 200, buf, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', { 'cache-control': 'no-cache' });
  });
}

const isKey = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// The screen asks for 63 days at a time; anything much bigger is refused so a
// stray request can't make the server expand years of recurring events.
const MAX_RANGE_DAYS = 120;

class BadRequest extends Error {}

async function api(route, q) {
  if (route === 'config') {
    return {
      demo: DEMO,
      people,
      location: config.location.name,
      countdowns: config.countdowns || [],
      lunch: schools.map((c) => c.schoolName || c.school),
      today: dayKey(new Date()),
    };
  }
  if (route === 'events') {
    const from = isKey(q.get('from')) ? q.get('from') : dayKey(addDays(new Date(), -7));
    const to = isKey(q.get('to')) ? q.get('to') : dayKey(addDays(new Date(), 56));
    const days = Math.round((parseKey(to) - parseKey(from)) / 864e5) + 1;
    if (!(days >= 1 && days <= MAX_RANGE_DAYS)) throw new BadRequest(`date range must be 1 to ${MAX_RANGE_DAYS} days`);
    const r = await getEvents({ from, to });
    return { ...r.data, stale: r.stale };
  }
  if (route === 'weather') { const r = await getWeather(); return { ...r.data, stale: r.stale }; }
  if (route === 'lunch') {
    // One school failing shouldn't hide the others' menus.
    const results = await Promise.allSettled(schools.map((_, i) => getLunch(i)));
    return {
      schools: results.map((r, i) => (r.status === 'fulfilled'
        ? { ...r.value.data, stale: r.value.stale }
        : { school: schools[i].schoolName || schools[i].school, days: [], failed: true })),
    };
  }
  return undefined;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  try {
    if (url.pathname === '/healthz') return send(res, 200, { ok: true });
    if (url.pathname.startsWith('/api/')) {
      const body = await api(url.pathname.slice(5), url.searchParams);
      return body === undefined ? send(res, 404, { error: 'unknown endpoint' }) : send(res, 200, body);
    }
    if (url.pathname.startsWith('/photos/')) return serveFile(res, path.join(CONFIG_DIR, 'photos'), decodeURIComponent(url.pathname.slice(8)));
    return serveFile(res, PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  } catch (err) {
    if (err instanceof BadRequest) return send(res, 400, { error: err.message });
    console.error(`[${url.pathname}] ${err.message}`);
    return send(res, 502, { error: err.message });
  }
});

server.listen(PORT, () => console.log(`[http] family calendar on http://0.0.0.0:${PORT}`));
