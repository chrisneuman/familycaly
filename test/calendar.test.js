'use strict';
process.env.TZ = 'America/Chicago';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { loadEvents } = require('../server/calendar');
const { parseDay } = require('../server/lunch');

const VTZ = `BEGIN:VTIMEZONE
TZID:America/Chicago
BEGIN:DAYLIGHT
TZOFFSETFROM:-0600
TZOFFSETTO:-0500
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0500
TZOFFSETTO:-0600
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE`;

const ics = (body) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:test\r\n${VTZ}\r\n${body}\r\nEND:VCALENDAR\r\n`.replace(/\r?\n/g, '\r\n');

const AVA = ics(`BEGIN:VEVENT
UID:soccer@test
DTSTART;TZID=America/Chicago:20261006T173000
DTEND;TZID=America/Chicago:20261006T190000
RRULE:FREQ=WEEKLY;BYDAY=TU,TH
EXDATE;TZID=America/Chicago:20261008T173000
SUMMARY:Soccer practice
LOCATION:Sheehan Park
END:VEVENT
BEGIN:VEVENT
UID:conf@test
DTSTART;TZID=America/Chicago:20261021T163000
DTEND;TZID=America/Chicago:20261021T173000
SUMMARY:Conferences
END:VEVENT
BEGIN:VEVENT
UID:cancel@test
DTSTART;TZID=America/Chicago:20261012T090000
DTEND;TZID=America/Chicago:20261012T100000
STATUS:CANCELLED
SUMMARY:Cancelled thing
END:VEVENT`);

const CHRIS = ics(`BEGIN:VEVENT
UID:trip@test
DTSTART;VALUE=DATE:20261013
DTEND;VALUE=DATE:20261016
SUMMARY:Denver trip
END:VEVENT
BEGIN:VEVENT
UID:conf@test
DTSTART;TZID=America/Chicago:20261021T163000
DTEND;TZID=America/Chicago:20261021T173000
SUMMARY:Conferences
END:VEVENT
BEGIN:VEVENT
UID:dst@test
DTSTART;TZID=America/Chicago:20261029T080000
DTEND;TZID=America/Chicago:20261029T083000
RRULE:FREQ=WEEKLY;COUNT=2
SUMMARY:Standup across DST
END:VEVENT`);

let server, base;
test.before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/ava.ics') return res.end(AVA);
    if (req.url === '/chris.ics') return res.end(CHRIS);
    res.statusCode = 404; res.end();
  });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

test('expands, splits and merges calendar events', async () => {
  const { events, errors } = await loadEvents([
    { label: 'Ava', ical: `${base}/ava.ics`, people: ['ava'] },
    { label: 'Chris', ical: `${base}/chris.ics`, people: ['chris'] },
    { label: 'Broken', ical: `${base}/missing.ics`, people: ['leo'] },
  ], '2026-10-04', '2026-11-07');

  assert.strictEqual(errors.length, 1, 'the missing calendar is reported, not fatal');

  const soccer = events.filter((e) => e.title === 'Soccer practice').map((e) => e.k);
  assert.ok(soccer.includes('2026-10-06'));
  assert.ok(!soccer.includes('2026-10-08'), 'EXDATE removed');
  assert.ok(soccer.includes('2026-10-13') && soccer.includes('2026-10-15'));
  assert.strictEqual(events.find((e) => e.title === 'Soccer practice').start, '17:30');

  const trip = events.filter((e) => e.title === 'Denver trip').map((e) => e.k);
  assert.deepStrictEqual(trip, ['2026-10-13', '2026-10-14', '2026-10-15'], 'all-day DTEND is exclusive');
  assert.strictEqual(events.find((e) => e.title === 'Denver trip').start, null);

  const conf = events.filter((e) => e.title === 'Conferences');
  assert.strictEqual(conf.length, 1, 'shared invite merged');
  assert.deepStrictEqual(conf[0].who.sort(), ['ava', 'chris']);

  assert.ok(!events.some((e) => e.title === 'Cancelled thing'));

  const dst = events.filter((e) => e.title === 'Standup across DST').map((e) => `${e.k} ${e.start}`);
  assert.deepStrictEqual(dst, ['2026-10-29 08:00', '2026-11-05 08:00'], 'wall-clock time holds across DST');
});

test('parses a Nutrislice day into entrees and sides', () => {
  const day = parseDay({
    date: '2026-10-05',
    menu_items: [
      { is_section_title: true, text: 'Entrees' },
      { food: { name: 'Chicken Tenders', food_category: 'entree' } },
      { food: { name: 'Cheese Pizza', food_category: 'entree' } },
      { is_section_title: true, text: 'Sides' },
      { food: { name: 'Green Beans', food_category: 'vegetable' } },
      { food: { name: '1% Milk', food_category: 'beverage' } },
    ],
  });
  assert.deepStrictEqual(day, { entrees: ['Chicken Tenders', 'Cheese Pizza'], sides: ['Green Beans'] });
  assert.strictEqual(parseDay({ date: '2026-10-10', menu_items: [] }), null);
});

test('skips Nutrislice connector rows and joins "with" onto the dish before it', () => {
  const day = parseDay({
    date: '2026-10-05',
    menu_items: [
      { is_section_title: true, text: 'Entrees' },
      { food: { name: 'WG Chicken Nuggets (C)', food_category: 'entree' } },
      { text: 'With', food: null },
      { food: { name: 'Sun Chips', food_category: 'entree' } },
      { text: 'or', food: null },
      { text: '', food: null },
      { food: { name: 'Fruit & Yogurt Parfait (V)', food_category: 'entree' } },
    ],
  });
  assert.deepStrictEqual(day.entrees, ['WG Chicken Nuggets (C) with Sun Chips', 'Fruit & Yogurt Parfait (V)']);
});
