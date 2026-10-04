(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const pad = (n) => String(n).padStart(2, '0');
  const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MON3 = MON.map((m) => m.slice(0, 3));
  const WEEKS_BEFORE = 1, NWEEKS = 9;          // one week back, eight ahead; three fill the screen
  const IDLE_MS = 90 * 1000;                    // untouched for this long: close sheets, scroll back to today
  const REFRESH = { events: 5 * 60e3, weather: 15 * 60e3, lunch: 60 * 60e3 };

  const PAW = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><ellipse cx="12" cy="16" rx="5" ry="4.3"/><ellipse cx="5.4" cy="10.4" rx="2.1" ry="2.6"/><ellipse cx="9.5" cy="6.3" rx="2.1" ry="2.7"/><ellipse cx="14.5" cy="6.3" rx="2.1" ry="2.7"/><ellipse cx="18.6" cy="10.4" rx="2.1" ry="2.6"/></svg>';
  const FORK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3v7a2 2 0 0 0 4 0V3M8 12v9M17 21V3c-2 0-3.5 2.5-3.5 6s1.5 4 3.5 4"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const WXL = { sun: 'Sunny', partly: 'Partly cloudy', cloud: 'Cloudy', rain: 'Rain', snow: 'Snow', storm: 'Storms' };

  function wxIcon(c, s) {
    const rays = [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
      const r = a * Math.PI / 180;
      return `<line x1="${(12 + 6.6 * Math.cos(r)).toFixed(1)}" y1="${(12 + 6.6 * Math.sin(r)).toFixed(1)}" x2="${(12 + 9 * Math.cos(r)).toFixed(1)}" y2="${(12 + 9 * Math.sin(r)).toFixed(1)}"/>`;
    }).join('');
    const sun = `<circle cx="12" cy="12" r="4.3" style="fill:var(--sun)"/><g style="stroke:var(--sun)" stroke-width="1.8" stroke-linecap="round">${rays}</g>`;
    const cloud = (dx, dy) => `<path transform="translate(${dx} ${dy})" d="M7 19h10.5a4 4 0 0 0 .4-7.98A5.5 5.5 0 0 0 7.4 9.6 4.7 4.7 0 0 0 7 19z" style="fill:var(--cloud)"/>`;
    const drops = (stroke) => `<g style="stroke:${stroke}" stroke-width="1.8" stroke-linecap="round"><line x1="8.5" y1="18.5" x2="7.5" y2="21.5"/><line x1="12.5" y1="18.5" x2="11.5" y2="21.5"/><line x1="16.5" y1="18.5" x2="15.5" y2="21.5"/></g>`;
    let g;
    if (c === 'sun') g = sun;
    else if (c === 'partly') g = `<g transform="translate(-2.5 -3.5) scale(.82)">${sun}</g>${cloud(1.5, 1)}`;
    else if (c === 'cloud') g = cloud(0, 0);
    else if (c === 'snow') g = `${cloud(0, -3)}<g style="fill:var(--rain)"><circle cx="8" cy="20" r="1.2"/><circle cx="12" cy="21" r="1.2"/><circle cx="16" cy="20" r="1.2"/></g>`;
    else if (c === 'storm') g = `${cloud(0, -3)}<path d="M12.5 16l-2.5 4h3l-1.5 3.5" fill="none" style="stroke:var(--sun)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
    else g = `${cloud(0, -3)}${drops('var(--rain)')}`;
    return `<svg class="wx" viewBox="0 0 24 24" width="${s}" height="${s}" role="img" aria-label="${WXL[c] || ''}">${g}</svg>`;
  }

  // ---- state -----------------------------------------------------------------

  const STORE = 'famcal-v1';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (_) { /* private mode */ }

  const S = {
    config: null, P: {}, FAM: [],
    on: new Set(),
    events: {}, byId: {}, meals: {},
    weather: null, wxByKey: {}, lunch: null,
    stale: {}, failed: {},
    today: null, start: null,
  };

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ off: S.config.people.map((p) => p.id).filter((id) => !S.on.has(id)) })); } catch (_) { /* ignore */ }
  }
  const isOn = (e) => e.who.length === 0 || e.who.some((id) => S.on.has(id));

  function setToday() {
    const n = new Date();
    S.today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    S.tkey = key(S.today);
    S.start = addDays(S.today, -S.today.getDay() - 7 * WEEKS_BEFORE);
  }
  const offOf = (d) => Math.round((d - S.today) / 864e5);
  const longDate = (d) => `${DOWL[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`;

  // ---- formatting -------------------------------------------------------------

  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  function fmtTime(t) { if (!t) return ''; let [h, m] = t.split(':').map(Number); const ap = h < 12 ? 'a' : 'p'; h = h % 12 || 12; return m ? `${h}:${pad(m)}${ap}` : `${h}${ap}`; }
  const range = (e) => (e.start ? `${fmtTime(e.start)} – ${fmtTime(e.end)}` : 'All day');
  const P = (id) => S.P[id] || { name: id, color: '#7a8194', ink: '#fff' };
  function names(e) {
    if (S.FAM.length > 1 && S.FAM.every((f) => e.who.includes(f))) return 'Everyone';
    return e.who.map((id) => P(id).name).join(' & ');
  }
  const dots = (e) => `<span class="dots">${e.who.map((id) => `<i style="background:${P(id).color}"></i>`).join('')}</span>`;
  const solid = (e) => (e.who.length === 1 ? P(e.who[0]).color : '#262b40');
  const ink = (e) => (e.who.length === 1 ? P(e.who[0]).ink : '#fff');
  const multi = (e) => (e.who.length > 1 ? dots(e) : '');

  // ---- data -------------------------------------------------------------------

  async function getJson(path) {
    const r = await fetch(path, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  }

  async function loadEvents() {
    const from = key(S.start), to = key(addDays(S.start, NWEEKS * 7 - 1));
    try {
      const j = await getJson(`/api/events?from=${from}&to=${to}`);
      S.events = {}; S.byId = {};
      for (const e of j.events) { (S.events[e.k] || (S.events[e.k] = [])).push(e); S.byId[e.id] = e; }
      S.meals = j.meals || {};
      S.stale.events = j.stale || (j.errors && j.errors.length > 0);
      S.failed.events = false;
    } catch (err) { S.failed.events = true; console.warn(err); }
  }
  async function loadWeather() {
    try {
      S.weather = await getJson('/api/weather');
      S.wxByKey = Object.fromEntries(S.weather.daily.map((d) => [d.k, d]));
      S.failed.weather = false;
    } catch (err) { S.failed.weather = true; console.warn(err); }
  }
  async function loadLunch() {
    if (!S.config.lunch.length) return;
    try {
      S.lunch = (await getJson('/api/lunch')).schools;
      S.failed.lunch = S.lunch.some((l) => l.failed);
    } catch (err) { S.failed.lunch = true; console.warn(err); }
  }

  // ---- today ------------------------------------------------------------------

  function todayList() {
    const n = new Date(), m = n.getHours() * 60 + n.getMinutes();
    let next = false;
    return (S.events[S.tkey] || []).filter(isOn).map((e) => {
      let s = 'up';
      if (!e.start) s = 'all';
      else if (toMin(e.end) <= m) s = 'done';
      else if (toMin(e.start) <= m) s = 'now';
      else if (!next) { s = 'next'; next = true; }
      return { e, s };
    });
  }

  function nextLunch(lu) {
    if (!lu || !lu.days || !lu.days.length) return null;
    const afterLunch = new Date().getHours() >= 10; // switch to the next school day at 10am
    const L = lu.days.find((d) => d.k > S.tkey || (d.k === S.tkey && !afterLunch));
    if (!L) return null;
    const off = offOf(parseKey(L.k));
    return { ...L, when: off === 0 ? 'Today' : off === 1 ? 'Tomorrow' : DOWL[parseKey(L.k).getDay()] };
  }

  function countdowns() {
    return (S.config.countdowns || []).map((c) => {
      let d = parseKey(c.date);
      if (c.yearly !== false && d < S.today) d.setFullYear(d.getFullYear() + 1);
      return { title: c.title, days: offOf(d) };
    }).filter((c) => c.days >= 0).sort((a, b) => a.days - b.days).slice(0, 2);
  }

  // ---- rendering --------------------------------------------------------------

  function renderHeader() {
    $('#dname').textContent = DOWL[S.today.getDay()];
    $('#dsub').textContent = `${MON[S.today.getMonth()]} ${S.today.getDate()}`;
    const w = S.weather;
    const wx = $('#wxnow');
    if (w) {
      const t = S.wxByKey[S.tkey] || w.daily[0];
      wx.innerHTML = `${wxIcon(w.current.c, '2.25rem')}<b>${w.current.t}°</b><span>${WXL[w.current.c]} · ${t.hi}°/${t.lo}°</span>`;
      wx.hidden = false;
    } else wx.hidden = true;
    // One button per school, labeled with the school's name.
    $('#lunches').innerHTML = S.config.lunch.map((name, i) => {
      const lu = S.lunch && S.lunch[i], L = nextLunch(lu);
      return `<button class="lunch" data-act="lunch" data-i="${i}">${FORK}<span><b>${esc((lu && lu.school) || name)}</b><em>${L ? `${L.when}: ${esc(L.entrees[0] || 'See menu')}` : 'Lunch menu'}</em></span></button>`;
    }).join('');
  }

  function renderPeople() {
    $('#people').innerHTML = S.config.people.map((p) => {
      const face = p.photo ? `<img src="${esc(p.photo)}" alt="">` : p.dog ? PAW : esc(p.name[0]);
      return `<button class="pp${S.on.has(p.id) ? '' : ' off'}" data-act="toggle" data-id="${esc(p.id)}" aria-pressed="${S.on.has(p.id)}" style="--c:${p.color};--pi:${p.ink}"><span class="av">${face}</span><span class="ck" aria-hidden="true">${CHECK}</span><span class="nm">${esc(p.name)}</span></button>`;
    }).join('');
  }

  function renderStrip() {
    const lab = { done: 'Done', now: 'Happening now', next: 'Up next', up: 'Later today', all: 'All day' };
    const l = todayList();
    let h = l.map(({ e, s }) => `<div class="card ${s}" data-eid="${e.id}" style="--cbg:${solid(e)};--cink:${ink(e)}"><span class="st">${multi(e)}${lab[s]}</span><span class="tm">${e.start ? fmtTime(e.start) : 'All day'}</span><span class="ti">${esc(e.title)}</span><span class="who">${esc(names(e))}</span></div>`).join('');
    if (!l.length) h = '<div class="card extra"><span class="st">Today</span><span class="tm">All clear</span><span class="who">Nothing on the calendar for the people shown</span></div>';
    const dinner = S.meals[S.tkey];
    if (dinner) h += `<div class="card extra"><span class="st">Dinner tonight</span><span class="tm">${esc(dinner)}</span><span class="who">From the Meals calendar</span></div>`;
    for (const c of countdowns()) h += `<div class="card extra"><span class="st">Countdown</span><span class="tm">${c.days === 0 ? 'Today!' : c.days === 1 ? '1 day' : `${c.days} days`}</span><span class="ti">until ${esc(c.title)}</span></div>`;
    $('#strip').innerHTML = h;
  }

  function wxSmall(k) {
    const w = S.wxByKey[k];
    return w && k >= S.tkey ? `<span class="wxm">${wxIcon(w.c, '1rem')}${w.hi}°</span>` : '';
  }

  function renderWeeks() {
    const maxChips = matchMedia('(orientation: portrait)').matches ? 6 : 3;
    let h = '';
    for (let w = 0; w < NWEEKS; w++) {
      const cur = w === WEEKS_BEFORE; // this week shows every event; its row grows to fit
      h += `<div class="week${cur ? ' cur' : ''}">`;
      for (let i = 0; i < 7; i++) {
        const d = addDays(S.start, w * 7 + i), k = key(d), off = offOf(d);
        const list = (S.events[k] || []).filter(isOn), shown = cur ? list : list.slice(0, maxChips), more = list.length - shown.length;
        const cls = `day${off === 0 ? ' today' : ''}${off < 0 ? ' past' : ''}`;
        h += `<div class="${cls}" role="button" tabindex="0" data-act="day" data-k="${k}" aria-label="${longDate(d)}, ${list.length} events">`
          + `<div class="dh"><span class="dn">${d.getDate() === 1 ? `${MON3[d.getMonth()]} ` : ''}${d.getDate()}</span>${wxSmall(k)}</div>`
          + `<div class="evs">${shown.map((e) => `<div class="chip" data-eid="${e.id}" style="--cbg:${solid(e)};--cink:${ink(e)}">${multi(e)}${e.start ? `<span class="tt">${fmtTime(e.start)}</span>` : ''}${esc(e.title)}</div>`).join('')}`
          + `${more > 0 ? `<span class="more">+${more} more</span>` : ''}</div></div>`;
      }
      h += '</div>';
    }
    const ws = $('#weeks'), st = ws.scrollTop;
    ws.innerHTML = h;
    ws.scrollTop = st;
  }

  function renderStatus() {
    const st = $('#status');
    const problems = [];
    if (S.failed.events) problems.push('Calendar offline');
    else if (S.stale.events) problems.push('Some calendars didn’t update');
    if (S.failed.weather) problems.push('Weather offline');
    if (S.failed.lunch) problems.push('Lunch menu offline');
    if (S.config.demo) problems.unshift('Sample data');
    st.textContent = problems.join(' · ');
    st.hidden = problems.length === 0;
  }

  function updMonth() {
    const ws = $('#weeks'), rows = ws.children;
    let i = 0;
    for (; i < rows.length - 1; i++) if (rows[i].offsetTop + rows[i].offsetHeight * 0.5 > ws.scrollTop) break;
    const mid = addDays(S.start, i * 7 + 3);
    $('#month').innerHTML = `${MON[mid.getMonth()]} <span>${mid.getFullYear()}</span>`;
  }

  function renderAll(resetScroll) {
    renderHeader(); renderPeople(); renderStrip();
    renderWeeks();
    if (resetScroll) scrollToday(false);
    updMonth(); renderStatus(); tick();
  }

  /** Re-renders event-dependent parts, animating chips out and in. */
  function refreshEvents(before) {
    const leaving = $$('[data-eid]').filter((x) => S.byId[x.dataset.eid] && !isOn(S.byId[x.dataset.eid]));
    leaving.forEach((x) => x.classList.add('leaving'));
    setTimeout(() => {
      renderStrip(); renderWeeks();
      if (before) $$('[data-eid]').forEach((x) => { if (!before.has(x.dataset.eid)) x.classList.add('entering'); });
    }, leaving.length ? 190 : 0);
  }

  function tick() {
    const d = new Date();
    let h = d.getHours();
    const ap = h < 12 ? 'AM' : 'PM';
    h = h % 12 || 12;
    $('#clock').textContent = `${h}:${pad(d.getMinutes())} ${ap}`;
  }

  // ---- sheets -----------------------------------------------------------------

  function openSheet(html) {
    const w = $('#sheet');
    $('.sheet', w).innerHTML = `<button class="x" data-act="close" aria-label="Close">×</button>${html}`;
    w.hidden = false;
  }
  const closeSheet = () => { $('#sheet').hidden = true; };

  function openDay(k) {
    const dt = parseKey(k), x = S.wxByKey[k];
    const all = S.events[k] || [], list = all.filter(isOn), hidden = all.length - list.length;
    const dinner = S.meals[k];
    openSheet(`<h2>${longDate(dt)}</h2><p class="sub">${k === S.tkey ? 'Today · ' : ''}${x ? `${wxIcon(x.c, '1.375rem')} ${WXL[x.c]}, ${x.hi}° / ${x.lo}°${x.p ? ` · ${x.p}% rain` : ''}` : 'No forecast yet'}</p>`
      + (list.length ? list.map((e) => `<div class="srow">${dots(e)}<div><div class="st">${esc(e.title)}</div><div class="sm">${range(e)}${e.loc ? ` · ${esc(e.loc)}` : ''} · ${esc(names(e))}</div></div></div>`).join('') : '<p class="empty">Nothing scheduled for the people shown.</p>')
      + (dinner ? `<p class="foot">Dinner: ${esc(dinner)}</p>` : '')
      + (hidden ? `<p class="foot">${hidden} more ${hidden === 1 ? 'event is' : 'events are'} hidden because ${hidden === 1 ? 'that person is' : 'those people are'} toggled off.</p>` : ''));
  }

  function openLunch(i) {
    const lu = S.lunch && S.lunch[i], L = nextLunch(lu);
    const rows = lu && lu.days.length ? lu.days.map((d) => {
      const dt = parseKey(d.k), off = offOf(dt);
      return `<div class="srow${L && d.k === L.k ? ' hl' : ''}"><span class="lday">${off === 0 ? 'Today' : off === 1 ? 'Tmrw' : `${DOW[dt.getDay()]} ${dt.getDate()}`}</span><div><div class="st">${esc(d.entrees.join(' or '))}</div>${d.sides.length ? `<div class="sm">${esc(d.sides.join(', '))}</div>` : ''}</div></div>`;
    }).join('') : `<p class="empty">${!lu || lu.failed ? 'The menu couldn’t be loaded right now.' : 'No school lunches posted for the next two weeks.'}</p>`;
    openSheet(`<h2>School lunch</h2><p class="sub">${esc((lu && lu.school) || S.config.lunch[i] || '')}</p>${rows}<p class="foot">From Nutrislice, refreshed hourly.</p>`);
  }

  function openWeather() {
    const w = S.weather;
    if (!w) return;
    const c = w.current, t = S.wxByKey[S.tkey] || w.daily[0];
    const extras = [`Feels like ${c.feels}°`, `Wind ${c.wind}`];
    if (c.humidity != null) extras.push(`Humidity ${c.humidity}%`);
    const sun = t.sunrise ? `<p class="foot">Sunrise ${fmtTime(t.sunrise)} · Sunset ${fmtTime(t.sunset)}${t.uv ? ` · UV index ${t.uv}` : ''}</p>` : '';
    const hours = (w.hourly || []).map((h, i) => `<div class="hr"><span class="hh">${i === 0 ? 'Now' : fmtTime(h.h)}</span>${wxIcon(h.c, '1.75rem')}<b>${h.t}°</b><span class="hp">${h.p >= 10 ? `${h.p}%` : ''}</span></div>`).join('');
    const days = w.daily.filter((d) => d.k >= S.tkey).slice(0, 10);
    const lo = Math.min(...days.map((d) => d.lo)), hi = Math.max(...days.map((d) => d.hi)), span = Math.max(1, hi - lo);
    const rows = days.map((d) => {
      const dt = parseKey(d.k), off = offOf(dt);
      const left = ((d.lo - lo) / span) * 100, width = Math.max(4, ((d.hi - d.lo) / span) * 100);
      return `<div class="wrow"><span class="lday">${off === 0 ? 'Today' : off === 1 ? 'Tmrw' : DOW[dt.getDay()]}</span>${wxIcon(d.c, '1.75rem')}<span class="wp">${d.p >= 10 ? `${d.p}%` : ''}</span><span class="wlo">${d.lo}°</span><span class="wbar"><i style="left:${left.toFixed(1)}%;width:${width.toFixed(1)}%"></i></span><span class="whi">${d.hi}°</span></div>`;
    }).join('');
    openSheet(`<h2>${c.t}° ${WXL[c.c] || ''}</h2><p class="sub">${esc(S.config.location || '')} · High ${t.hi}° · Low ${t.lo}°</p>`
      + `<p class="wmeta">${extras.map(esc).join(' · ')}</p>`
      + (hours ? `<div class="hours">${hours}</div>` : '')
      + `<div class="wdays">${rows}</div>${sun}<p class="foot">Percentages are the chance of rain. From Open-Meteo, refreshed every 15 minutes.</p>`);
  }

  function scrollToday(smooth) {
    const ws = $('#weeks');
    ws.scrollTo({ top: ws.children[WEEKS_BEFORE].offsetTop, behavior: smooth ? 'smooth' : 'auto' });
  }

  // ---- input ------------------------------------------------------------------

  function toggle(id) {
    const before = new Set($$('[data-eid]').map((x) => x.dataset.eid));
    if (S.on.has(id)) S.on.delete(id); else S.on.add(id);
    save();
    $$('.pp').forEach((b) => { const o = S.on.has(b.dataset.id); b.classList.toggle('off', !o); b.setAttribute('aria-pressed', o); });
    refreshEvents(before);
  }

  let idleTimer;
  function poke() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { closeSheet(); scrollToday(true); }, IDLE_MS);
  }

  document.addEventListener('click', (e) => {
    poke();
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const a = t.dataset.act;
    if (a === 'close') { if (t.id === 'sheet' && e.target !== t) return; closeSheet(); }
    else if (a === 'toggle') toggle(t.dataset.id);
    else if (a === 'day') openDay(t.dataset.k);
    else if (a === 'lunch') openLunch(Number(t.dataset.i));
    else if (a === 'weather') openWeather();
    else if (a === 'today') scrollToday(true);
  });
  document.addEventListener('keydown', (e) => {
    poke();
    if (e.key === 'Escape') closeSheet();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); }
  });
  document.addEventListener('pointerdown', poke, { passive: true });

  // ---- boot -------------------------------------------------------------------

  async function boot() {
    try {
      S.config = await getJson('/api/config');
    } catch (err) {
      console.warn(err);
      setTimeout(boot, 10e3); // server not up yet; keep trying
      return;
    }
    S.P = Object.fromEntries(S.config.people.map((p) => [p.id, p]));
    S.FAM = S.config.people.filter((p) => !p.dog).map((p) => p.id);
    S.on = new Set(S.config.people.map((p) => p.id).filter((id) => !(saved.off || []).includes(id)));
    $('#dow').innerHTML = DOW.map((d) => `<span>${d}</span>`).join('');
    setToday();
    await Promise.all([loadEvents(), loadWeather(), loadLunch()]);
    renderAll(true);
    $('#app').classList.remove('loading');
    $('#weeks').addEventListener('scroll', updMonth, { passive: true });

    setInterval(async () => { await loadEvents(); refreshEvents(null); renderStatus(); }, REFRESH.events);
    setInterval(async () => { await loadWeather(); renderHeader(); renderWeeks(); renderStatus(); }, REFRESH.weather);
    setInterval(async () => { await loadLunch(); renderHeader(); }, REFRESH.lunch);
    setInterval(() => {
      tick();
      const n = new Date();
      if (key(n) !== S.tkey) { setToday(); Promise.all([loadEvents(), loadWeather(), loadLunch()]).then(() => renderAll(true)); }
      else if (n.getSeconds() < 15) renderStrip(); // move "Up next" along once a minute
      // A fresh page load each night keeps a long-running browser on a Pi 3 from slowing down.
      if (n.getHours() === 3 && n.getMinutes() === 30 && n.getSeconds() < 15) location.reload();
    }, 15e3);
  }
  boot();
}());
