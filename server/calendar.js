'use strict';

const ical = require('node-ical');
const { dayKey, hhmm, addDays, parseKey, fetchText } = require('./util');

/**
 * Loads every configured calendar and returns events split into one entry
 * per local day, in the shape the screen uses:
 *   { id, who: [personId], title, k: 'YYYY-MM-DD', start: 'HH:MM'|null, end, loc }
 *
 * An event that appears on several people's calendars (a shared invite has
 * the same UID and start) is merged into one entry listing all of them.
 */
async function loadEvents(calendars, fromKey, toKey) {
  const from = parseKey(fromKey);
  const to = addDays(parseKey(toKey), 1);

  const results = await Promise.allSettled(calendars.map(async (cal) => {
    const parsed = ical.sync.parseICS(await fetchText(cal.ical));
    return { cal, parsed };
  }));

  const merged = new Map();
  const errors = [];

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      errors.push(`${calendars[i].label}: ${r.reason.message}`);
      return;
    }
    const { cal, parsed } = r.value;
    for (const ev of Object.values(parsed)) {
      if (ev.type !== 'VEVENT' || ev.recurrenceid) continue; // overrides are applied by expandRecurringEvent
      if (ev.status === 'CANCELLED') continue;
      let instances;
      try {
        instances = ical.expandRecurringEvent(ev, { from, to, expandOngoing: true });
      } catch (err) {
        errors.push(`${cal.label}: ${err.message}`);
        continue;
      }
      for (const inst of instances) {
        if (inst.event && inst.event.status === 'CANCELLED') continue;
        const uidKey = `${ev.uid}|${inst.start.getTime()}`;
        const existing = merged.get(uidKey);
        if (existing) {
          for (const p of cal.people) if (!existing.who.includes(p)) existing.who.push(p);
          continue;
        }
        merged.set(uidKey, {
          uid: uidKey,
          who: [...cal.people],
          title: String(inst.summary || '(No title)'),
          loc: inst.event && inst.event.location ? String(inst.event.location) : '',
          start: inst.start,
          end: inst.end || inst.start,
          allDay: Boolean(inst.isFullDay),
        });
      }
    }
  });

  const out = [];
  let n = 0;
  for (const ev of merged.values()) {
    for (const piece of splitByDay(ev, from, to)) out.push({ id: `e${n++}`, ...piece });
  }
  out.sort((a, b) => a.k.localeCompare(b.k) || (a.start || '').localeCompare(b.start || ''));
  return { events: out, errors };
}

/** All-day and multi-day events get an entry on each day they cover. */
function splitByDay(ev, from, to) {
  const base = { who: ev.who, title: ev.title, loc: ev.loc };
  if (ev.allDay) {
    const pieces = [];
    for (let d = new Date(Math.max(ev.start, from)); d < ev.end && d < to; d = addDays(d, 1)) {
      pieces.push({ ...base, k: dayKey(d), start: null, end: null });
    }
    return pieces;
  }
  if (ev.start < from || ev.start >= to) return [];
  const sameDay = dayKey(ev.start) === dayKey(ev.end);
  return [{ ...base, k: dayKey(ev.start), start: hhmm(ev.start), end: sameDay ? hhmm(ev.end) : '23:59' }];
}

/** Dinner titles from an optional "Meals" calendar, keyed by day. */
async function loadMeals(icalUrl, fromKey, toKey) {
  if (!icalUrl) return {};
  const { events } = await loadEvents([{ label: 'Meals', ical: icalUrl, people: [] }], fromKey, toKey);
  const meals = {};
  for (const e of events) if (!meals[e.k]) meals[e.k] = e.title;
  return meals;
}

module.exports = { loadEvents, loadMeals };
