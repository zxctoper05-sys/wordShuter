// Локальное хранилище: настройки, анонимный ID игрока, очередь неотправленных результатов.
const SETTINGS_KEY = 'wordshooter.settings.v1';
const PLAYER_KEY = 'wordshooter.player.v1';
const PENDING_KEY = 'wordshooter.pending.v1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const DEFAULT_SETTINGS = Object.freeze({
  uiLang: 'ru',
  gameLang: 'ru',
  mode: 'classic',
  commonOnly: true,
  keyboard: 'auto',
  effects: true,
  shake: true,
});

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* хранилище недоступно (приватный режим) — работаем без сохранения */ }
}

const pick = (v, allowed, d) => (allowed.includes(v) ? v : d);

function sanitize(s) {
  return {
    uiLang: pick(s.uiLang, ['ru', 'en'], 'ru'),
    gameLang: pick(s.gameLang, ['ru', 'en'], 'ru'),
    mode: pick(s.mode, ['classic', 'survival', 'timeattack', 'endless'], 'classic'),
    commonOnly: s.commonOnly !== false,
    keyboard: pick(s.keyboard, ['auto', 'on', 'off'], 'auto'),
    effects: s.effects !== false,
    shake: s.shake !== false,
  };
}

let state = sanitize({ ...DEFAULT_SETTINGS, ...read(SETTINGS_KEY, {}) });
const listeners = new Set();

export const settings = {
  get: (key) => state[key],
  all: () => ({ ...state }),
  set(patch) {
    const next = sanitize({ ...state, ...patch });
    const changed = Object.keys(next).filter((k) => next[k] !== state[k]);
    if (!changed.length) return;
    state = next;
    write(SETTINGS_KEY, state);
    listeners.forEach((fn) => fn(state, changed));
  },
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); // доступно и без HTTPS
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function getPlayerId() {
  let id = read(PLAYER_KEY, null);
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    id = uuid();
    write(PLAYER_KEY, id);
  }
  return id;
}

export const pendingGames = {
  load: () => read(PENDING_KEY, []),
  save: (list) => write(PENDING_KEY, list.slice(-20)),
};
