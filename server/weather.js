'use strict';

const { fetchJson } = require('./util');

/** WMO weather codes (used by Open-Meteo) mapped to the screen's icon set. */
function condition(code) {
  if (code <= 1) return 'sun';
  if (code === 2) return 'partly';
  if (code === 3 || code === 45 || code === 48) return 'cloud';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'rain';
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const hm = (iso) => (typeof iso === 'string' ? iso.slice(11, 16) : null);

function nextHours(h, nowIso, n) {
  const start = Math.max(0, h.time.findIndex((t) => t.slice(0, 13) === String(nowIso).slice(0, 13)));
  return h.time.slice(start, start + n).map((t, i) => ({
    h: hm(t),
    t: Math.round(h.temperature_2m[start + i]),
    c: condition(h.weather_code[start + i]),
    p: h.precipitation_probability[start + i] ?? 0,
  }));
}

async function loadWeather({ latitude, longitude }, units) {
  const metric = units === 'celsius';
  const q = new URLSearchParams({
    latitude, longitude,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m',
    hourly: 'temperature_2m,weather_code,precipitation_probability',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max',
    temperature_unit: metric ? 'celsius' : 'fahrenheit',
    wind_speed_unit: metric ? 'kmh' : 'mph',
    timezone: 'auto',
    forecast_days: '14',
  });
  const j = await fetchJson(`https://api.open-meteo.com/v1/forecast?${q}`);
  const c = j.current;
  return {
    current: {
      t: Math.round(c.temperature_2m),
      feels: Math.round(c.apparent_temperature),
      c: condition(c.weather_code),
      wind: `${Math.round(c.wind_speed_10m)} ${metric ? 'km/h' : 'mph'} ${COMPASS[Math.round(c.wind_direction_10m / 45) % 8]}`,
      humidity: Math.round(c.relative_humidity_2m),
    },
    // Next 12 hours, starting with the current hour. Times are local (timezone=auto).
    hourly: nextHours(j.hourly, c.time, 12),
    daily: j.daily.time.map((date, i) => ({
      k: date,
      hi: Math.round(j.daily.temperature_2m_max[i]),
      lo: Math.round(j.daily.temperature_2m_min[i]),
      c: condition(j.daily.weather_code[i]),
      p: j.daily.precipitation_probability_max[i] ?? 0,
      sunrise: hm(j.daily.sunrise[i]),
      sunset: hm(j.daily.sunset[i]),
      uv: Math.round(j.daily.uv_index_max[i] ?? 0),
    })),
  };
}

module.exports = { loadWeather };
