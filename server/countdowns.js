'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/*
 * Countdowns added and removed on the screen live in data/countdowns.json, not in
 * family.json, so the config folder can stay read-only. The first time it runs it
 * copies the countdowns from family.json, and from then on this file is what counts.
 */
const MAX_COUNT = 30, MAX_TITLE = 40;

class Countdowns {
  constructor(dir, seed) {
    this.file = path.join(dir, 'countdowns.json');
    this.dir = dir;
    try {
      this.list = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (_) {
      this.list = (seed || []).map((c) => ({ id: newId(), title: String(c.title), date: c.date, yearly: c.yearly !== false }));
    }
  }

  all() { return this.list; }

  add({ title, date, yearly }) {
    title = typeof title === 'string' ? title.trim() : '';
    if (!title || title.length > MAX_TITLE) throw new Invalid(`name must be 1 to ${MAX_TITLE} characters`);
    if (!validDate(date)) throw new Invalid('date must be a real date, YYYY-MM-DD');
    if (this.list.length >= MAX_COUNT) throw new Invalid(`at most ${MAX_COUNT} countdowns`);
    const c = { id: newId(), title, date, yearly: Boolean(yearly) };
    this.list.push(c);
    this.save();
    return c;
  }

  remove(id) {
    const n = this.list.length;
    this.list = this.list.filter((c) => c.id !== id);
    if (this.list.length === n) return false;
    this.save();
    return true;
  }

  save() {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.list, null, 2));
    fs.renameSync(tmp, this.file); // a power cut mid-write can't leave half a file
  }
}

class Invalid extends Error {}

const newId = () => crypto.randomBytes(6).toString('hex');

function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return y >= 2000 && y <= 2100 && dt.getMonth() === m - 1 && dt.getDate() === d;
}

module.exports = { Countdowns, Invalid };
