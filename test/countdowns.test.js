'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Countdowns, Invalid } = require('../server/countdowns');

test('countdowns seed from family.json, then add, remove and persist', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-'));
  const a = new Countdowns(dir, [{ title: 'Halloween', date: '2026-10-31' }]);
  assert.deepStrictEqual(a.all().map((c) => [c.title, c.yearly]), [['Halloween', true]]);
  const c = a.add({ title: '  Beach trip ', date: '2027-07-04', yearly: false });
  assert.strictEqual(c.title, 'Beach trip');
  const b = new Countdowns(dir, [{ title: 'ignored once saved', date: '2026-01-01' }]);
  assert.deepStrictEqual(b.all().map((x) => x.title), ['Halloween', 'Beach trip']);
  assert.strictEqual(b.remove(c.id), true);
  assert.strictEqual(b.remove('nope'), false);
  assert.deepStrictEqual(new Countdowns(dir).all().map((x) => x.title), ['Halloween']);
});

test('countdowns reject bad input', () => {
  const a = new Countdowns(fs.mkdtempSync(path.join(os.tmpdir(), 'cd-')));
  for (const bad of [{ title: '', date: '2027-01-01' }, { title: 'x'.repeat(41), date: '2027-01-01' }, { title: 'x', date: '2027-02-30' }, { title: 'x', date: 'tomorrow' }, { title: 5, date: '2027-01-01' }]) {
    assert.throws(() => a.add(bad), Invalid);
  }
});
