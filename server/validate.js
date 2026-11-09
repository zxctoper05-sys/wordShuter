import { LANGS, MODES } from './constants.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

export function clampInt(value, min, max, fallback) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const INT_FIELDS = {
  score: [0, 10_000_000],
  wordsDestroyed: [0, 100_000],
  wordsMissed: [0, 100_000],
  bestCombo: [0, 100_000],
  level: [1, 1000],
  durationMs: [0, 6 * 3600 * 1000],
};
const FLOAT_FIELDS = { avgWpm: [0, 600], maxWpm: [0, 600], accuracy: [0, 100] };

/** Проверяет результат игры, пришедший от клиента. Возвращает { value } или { error }. */
export function validateGame(body) {
  if (!body || typeof body !== 'object') return { error: 'invalid_body' };
  if (!isUuid(body.playerId)) return { error: 'invalid_player' };
  if (!MODES.includes(body.mode)) return { error: 'invalid_mode' };
  if (!LANGS.includes(body.lang)) return { error: 'invalid_lang' };

  const value = { playerId: body.playerId, mode: body.mode, lang: body.lang, victory: body.victory === true };
  for (const [key, [min, max]] of Object.entries(INT_FIELDS)) {
    const n = Number(body[key]);
    if (!Number.isFinite(n) || n < min || n > max) return { error: `invalid_${key}` };
    value[key] = Math.round(n);
  }
  for (const [key, [min, max]] of Object.entries(FLOAT_FIELDS)) {
    const n = Number(body[key]);
    if (!Number.isFinite(n) || n < min || n > max) return { error: `invalid_${key}` };
    value[key] = Math.round(n * 10) / 10;
  }
  return { value };
}
