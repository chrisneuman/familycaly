'use strict';

const { dayKey, addDays, fetchJson } = require('./util');

/*
 * Nutrislice serves its menu pages from a JSON "weeks" feed:
 *   https://{district}.api.nutrislice.com/menu/api/weeks/school/{school}/menu-type/{type}/{yyyy}/{mm}/{dd}/
 * Each day has an ordered list of menu_items. Section headers ("Entrees",
 * "Sides", ...) are items with is_section_title=true; the rest carry food.name.
 */
function weekUrl({ district, school, menuType }, d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `https://${district}.api.nutrislice.com/menu/api/weeks/school/${school}/menu-type/${menuType}/${y}/${m}/${day}/`;
}

function parseDay(day) {
  const sections = [];
  let current = { title: '', items: [] };
  for (const item of day.menu_items || []) {
    if (item.is_section_title) {
      if (current.items.length) sections.push(current);
      current = { title: String(item.text || '').trim(), items: [] };
      continue;
    }
    const name = item.food && item.food.name ? String(item.food.name).trim() : String(item.text || '').trim();
    if (!name) continue;
    const category = item.food && item.food.food_category;
    current.items.push({ name, category });
  }
  if (current.items.length) sections.push(current);

  const all = sections.flatMap((s) => s.items.map((i) => ({ ...i, section: s.title })));
  if (!all.length) return null;

  const isEntree = (i) => i.category === 'entree' || /entr[eé]e|main/i.test(i.section);
  let entrees = all.filter(isEntree);
  if (!entrees.length) entrees = all.slice(0, 1);
  const sides = all.filter((i) => !entrees.includes(i) && !/milk/i.test(i.name));

  return { entrees: entrees.map((i) => i.name), sides: sides.map((i) => i.name) };
}

/** This week and next week of school lunches, school days only. */
async function loadLunch(cfg) {
  const today = new Date();
  const sunday = addDays(new Date(today.getFullYear(), today.getMonth(), today.getDate()), -today.getDay());
  const weeks = await Promise.all([sunday, addDays(sunday, 7)].map((d) => fetchJson(weekUrl(cfg, d))));
  const todayKey = dayKey(today);
  const days = [];
  for (const w of weeks) {
    for (const day of w.days || []) {
      if (!day.date || day.date < todayKey) continue;
      const parsed = parseDay(day);
      if (parsed) days.push({ k: day.date, ...parsed });
    }
  }
  return { school: cfg.schoolName || cfg.school, url: `https://${cfg.district}.nutrislice.com/menu/${cfg.school}/${cfg.menuType}/`, days };
}

module.exports = { loadLunch, parseDay };
