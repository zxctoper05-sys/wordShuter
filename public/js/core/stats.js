// Клиентская часть статистики: отправка результатов (с очередью на случай сбоя), загрузка, форматирование.
import { api } from './api.js';
import { bus } from './bus.js';
import { getPlayerId, pendingGames } from './storage.js';

export function formatDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** «1 ч 05 мин» / «12 мин» / «40 сек» — подписи единиц передаются снаружи (локализация). */
export function formatPlayTime(ms, units) {
  const totalMin = Math.round(ms / 60000);
  if (totalMin === 0) return `${Math.round(ms / 1000)} ${units.sec}`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h ? `${h} ${units.h} ${String(m).padStart(2, '0')} ${units.min}` : `${m} ${units.min}`;
}

const isClientError = (e) => e?.status >= 400 && e?.status < 500 && e.status !== 429;
let flushing = false;

export const stats = {
  last: null,

  async submit(summary) {
    const payload = { playerId: getPlayerId(), ...summary };
    try {
      const res = await api.saveGame(payload);
      bus.emit('statschanged');
      stats.flushPending();
      return { status: 'saved', records: res.records };
    } catch (err) {
      if (isClientError(err)) return { status: 'failed', records: null };
      pendingGames.save([...pendingGames.load(), payload]);
      return { status: 'queued', records: null };
    }
  },

  async flushPending() {
    if (flushing) return;
    flushing = true;
    try {
      const rest = [];
      for (const payload of pendingGames.load()) {
        try {
          await api.saveGame(payload);
        } catch (err) {
          if (!isClientError(err)) rest.push(payload);
        }
      }
      pendingGames.save(rest);
    } finally {
      flushing = false;
    }
  },

  async fetch() {
    stats.last = await api.getStats(getPlayerId());
    return stats.last;
  },
};
