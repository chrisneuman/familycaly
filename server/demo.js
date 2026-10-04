'use strict';

// Sample family, events, weather and lunch so the screen can be tried
// before any real calendars are connected (DEMO=1, or no family.json yet).

const { dayKey, addDays, parseKey } = require('./util');

const config = {
  location: { name: 'Sun Prairie, WI', latitude: 43.18, longitude: -89.21 },
  units: 'fahrenheit',
  people: [
    { id: 'chris', name: 'Chris', color: '#3d6bff' },
    { id: 'jamie', name: 'Jamie', color: '#e8457a' },
    { id: 'ava', name: 'Ava', color: '#8c5cf0' },
    { id: 'leo', name: 'Leo', color: '#108c5c' },
    { id: 'maple', name: 'Maple', color: '#f2a93b', dog: true },
  ],
  lunch: { district: 'sunprairie', school: 'cardinal-heights-upper-middle', schoolName: 'Cardinal Heights Upper Middle', menuType: 'lunch' },
  countdowns: [{ title: 'Halloween', date: `${new Date().getFullYear()}-10-31` }],
};

const FAM = ['chris', 'jamie', 'ava', 'leo'];

// One-off events keyed by days from today: [who, title, start, end, place]
const ONE = {
  '-6': [[FAM, 'Dinner at Grandma’s', '17:30', '19:30', 'Grandma’s house']],
  '-3': [[['ava'], 'Science fair', '18:00', '19:30', 'Cardinal Heights gym']],
  0: [[['ava'], 'Sleepover pickup', '10:00', '10:30', 'The Nguyens’'], [FAM, 'Apple orchard', '13:00', '15:30', 'Eplegaarden'], [['jamie'], 'Meal prep', '17:00', '18:00', 'Kitchen'], [['chris'], 'Packers game', '19:20', '22:30', 'Living room']],
  1: [[['chris'], 'Quarterly review', '14:00', '15:00', 'Office']],
  2: [[['maple'], 'Vet checkup', '15:15', '16:00', 'Sun Prairie Animal Hospital']],
  3: [[['jamie'], 'Book club', '19:00', '21:00', 'Library']],
  4: [[['ava'], 'Field trip: zoo', null, null, 'Henry Vilas Zoo']],
  6: [[FAM, 'Fall festival', '11:00', '14:00', 'Angell Park']],
  8: [[['jamie'], 'Dentist', '09:00', '10:00', 'Main St Dental']],
  9: [[['chris'], 'Denver trip', null, null, 'DEN']],
  10: [[['chris'], 'Denver trip', null, null, 'DEN']],
  11: [[['chris'], 'Denver trip', null, null, 'DEN']],
  12: [[['leo'], 'Max’s birthday party', '14:00', '16:00', 'Pump It Up']],
  13: [[FAM, 'Grandparents visit', null, null, '']],
  15: [[['ava'], 'Picture day', null, null, 'School']],
  17: [[['chris', 'jamie'], 'Parent-teacher conferences', '16:30', '17:30', 'Cardinal Heights']],
  20: [[['leo'], 'Dentist', '15:00', '16:00', 'Main St Dental']],
  22: [[['maple'], 'Grooming', '10:00', '11:30', 'Bark Avenue']],
  24: [[['ava', 'leo'], 'Costume shopping', '16:00', '17:00', 'Target']],
};

const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
const offOf = (d) => Math.round((d - today()) / 864e5);

function events(fromKey, toKey) {
  const from = parseKey(fromKey), to = parseKey(toKey);
  const out = [];
  let n = 0;
  const add = (d, who, title, start, end, loc = '') => out.push({ id: `e${n++}`, who, title, k: dayKey(d), start, end, loc });
  for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
    const w = d.getDay();
    const wk = Math.floor(offOf(addDays(d, -w)) / 7);
    if (w === 0) add(d, ['maple'], 'Long walk', '08:30', '09:15', 'Prairie trail');
    if (w === 1) add(d, ['jamie'], 'Spin class', '06:00', '06:45', 'CycleBar');
    if (w === 2 || w === 4) add(d, ['ava'], 'Soccer practice', '17:30', '19:00', 'Sheehan Park');
    if (w === 3) { add(d, ['leo'], 'Piano lesson', '16:00', '16:45', 'Ms. Ortiz'); add(d, ['chris'], 'Late standup', '18:00', '18:30', 'Zoom'); }
    if (w === 5) add(d, FAM, 'Pizza & movie night', '18:30', '21:00', 'Living room');
    if (w === 6) { if (wk % 2 === 0) add(d, ['maple'], 'Dog park', '08:00', '09:00', 'Token Creek'); add(d, ['leo'], 'Hockey game', '10:00', '11:15', 'Sun Prairie Ice Arena'); }
    if (d.getMonth() === 9 && d.getDate() === 31) add(d, FAM, 'Trick-or-treat', '17:30', '19:30', 'Neighborhood');
    for (const o of ONE[offOf(d)] || []) add(d, ...o);
  }
  out.sort((a, b) => a.k.localeCompare(b.k) || (a.start || '').localeCompare(b.start || ''));
  return out;
}

const DINNERS = ['Sheet-pan fajitas', 'Chili & cornbread', 'Pasta night', 'Breakfast for dinner', 'Teriyaki salmon', 'Pizza & movie night', 'Grill out'];
function meals(fromKey, toKey) {
  const m = {};
  for (let d = parseKey(fromKey); d <= parseKey(toKey); d = addDays(d, 1)) m[dayKey(d)] = DINNERS[d.getDay()];
  return m;
}

const WX = [[62, 44, 'partly', 10], [66, 48, 'sun', 0], [58, 46, 'rain', 80], [54, 40, 'cloud', 30], [57, 38, 'sun', 0], [61, 45, 'partly', 10], [63, 50, 'rain', 60], [55, 41, 'cloud', 20], [52, 36, 'sun', 0], [56, 39, 'partly', 10]];
const HOURLY = [[58, 'partly', 10], [60, 'partly', 10], [61, 'sun', 0], [62, 'sun', 0], [61, 'sun', 0], [59, 'partly', 5], [56, 'cloud', 15], [53, 'cloud', 20], [51, 'cloud', 25], [49, 'rain', 40], [48, 'rain', 55], [47, 'rain', 60]];
function weather() {
  const h0 = new Date().getHours();
  return {
    current: { t: 58, feels: 55, c: 'partly', wind: '8 mph NW', humidity: 62 },
    hourly: HOURLY.map(([t, c, p], i) => ({ h: `${String((h0 + i) % 24).padStart(2, '0')}:00`, t, c, p })),
    daily: WX.map(([hi, lo, c, p], i) => ({ k: dayKey(addDays(today(), i)), hi, lo, c, p, sunrise: '07:04', sunset: '18:26', uv: [4, 5, 2, 3, 5, 4, 2, 3, 4, 4][i] })),
  };
}

const MENU = [['Chicken tenders', 'Mashed potatoes, green beans, apple'], ['Cheese pizza', 'Caesar salad, baby carrots, pear'], ['Beef tacos', 'Black beans, corn, salsa, orange'], ['Pancakes & sausage', 'Hash browns, strawberries, yogurt'], ['Orange chicken', 'Brown rice, broccoli, mandarin'], ['Mac & cheese', 'Peas, garlic toast, banana'], ['Cheeseburger', 'Sweet potato fries, cucumbers, grapes'], ['Chicken quesadilla', 'Spanish rice, pinto beans, kiwi'], ['Spaghetti & meatballs', 'Breadstick, side salad, applesauce'], ['Turkey & cheese sub', 'Chips, celery sticks, watermelon']];
function lunch() {
  const days = [];
  for (let d = today(), i = 0; days.length < 10; d = addDays(d, 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const [e, s] = MENU[i++ % MENU.length];
    days.push({ k: dayKey(d), entrees: [e], sides: s.split(', ') });
  }
  return { school: config.lunch.schoolName, url: 'https://sunprairie.nutrislice.com/menu/cardinal-heights-upper-middle/lunch/', days };
}

module.exports = { config, events, meals, weather, lunch };
