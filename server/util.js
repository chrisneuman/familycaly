'use strict';

const pad = (n) => String(n).padStart(2, '0');

/** Local calendar date key, e.g. 2026-10-04 (uses the process TZ). */
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Local wall-clock time, e.g. 17:30. */
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const parseKey = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/**
 * Wraps an async loader with a time-based cache. On failure the last good
 * value is served (marked stale) so the wall screen keeps showing data
 * through an internet blip.
 */
function cached(ttlMs, load) {
  const entries = new Map();
  return async (arg = '') => {
    const id = JSON.stringify(arg);
    const hit = entries.get(id);
    if (hit && Date.now() - hit.at < ttlMs) return { data: hit.data, stale: false };
    try {
      const data = await load(arg);
      entries.set(id, { data, at: Date.now() });
      return { data, stale: false };
    } catch (err) {
      console.error(`[fetch] ${err.message}`);
      if (hit) return { data: hit.data, stale: true };
      throw err;
    }
  };
}

async function fetchJson(url, timeoutMs = 15000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return res.json();
}

async function fetchText(url, timeoutMs = 20000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return res.text();
}

module.exports = { pad, dayKey, hhmm, parseKey, addDays, cached, fetchJson, fetchText };
