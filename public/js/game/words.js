// Поставщик слов для игровой сессии: буферы по тирам сложности, подгрузка пачками с API
// в фоне, без повторов в рамках сессии и без обращений к внешним словарям.
import { norm } from './text.js';

export const TIER_COUNT = 5;

export class WordProvider {
  constructor({ lang, commonOnly = true, maxLength = 14, fetchBatch, batchSize = 40, lowWater = 12 }) {
    this.lang = lang;
    this.commonOnly = commonOnly;
    this.maxLength = maxLength;
    this.fetchBatch = fetchBatch;
    this.batchSize = batchSize;
    this.lowWater = lowWater;
    this.buffers = Array.from({ length: TIER_COUNT + 1 }, () => []); // индексы 1..5
    this.seen = new Set();       // id всех полученных слов — повторов в сессии нет
    this.loading = new Set();
    this.exhausted = new Set();  // тиры, в которых слова закончились
    this.retryAt = new Map();
    this.lastError = null;
    this.destroyed = false;
  }

  /** Загружает стартовый запас слов для всех тиров. Возвращает, сколько слов в буферах. */
  async prefetch() {
    await Promise.all(Array.from({ length: TIER_COUNT }, (_, i) => this.#refill(i + 1)));
    return this.buffers.reduce((n, b) => n + b.length, 0);
  }

  /**
   * Берёт слово заданного тира (или ближайшего, если пусто).
   * avoid — множество первых букв слов на экране: по возможности берём слово с другой буквой,
   * чтобы по первой набранной букве цель определялась однозначно.
   */
  take(tier, avoid) {
    const order = this.#order(tier);
    for (const strict of avoid ? [true, false] : [false]) {
      for (const t of order) {
        const buf = this.buffers[t];
        const i = strict ? buf.findIndex((w) => !avoid.has(w.first)) : buf.length ? 0 : -1;
        if (i >= 0) {
          const [word] = buf.splice(i, 1);
          if (buf.length < this.lowWater) this.#refill(t);
          return word;
        }
      }
    }
    for (const t of order) if (this.buffers[t].length < this.lowWater) this.#refill(t);
    return null;
  }

  destroy() {
    this.destroyed = true;
  }

  #order(tier) {
    const out = [tier];
    for (let d = 1; d < TIER_COUNT; d++) {
      if (tier - d >= 1) out.push(tier - d);
      if (tier + d <= TIER_COUNT) out.push(tier + d);
    }
    return out;
  }

  async #refill(tier) {
    if (this.destroyed || this.loading.has(tier) || this.exhausted.has(tier)) return;
    if (Date.now() < (this.retryAt.get(tier) ?? 0)) return;
    this.loading.add(tier);
    try {
      const rows = await this.fetchBatch({
        lang: this.lang,
        difficulty: tier,
        count: this.batchSize,
        maxLength: this.maxLength,
        commonOnly: this.commonOnly,
        exclude: Array.from(this.seen).slice(-2000),
      });
      if (this.destroyed) return;
      for (const row of rows) {
        if (this.seen.has(row.id)) continue;
        this.seen.add(row.id);
        const n = norm(row.word);
        this.buffers[tier].push({ id: row.id, text: row.word, norm: n, first: n[0], tier });
      }
      if (rows.length === 0) this.exhausted.add(tier);
      this.lastError = null;
    } catch (err) {
      this.lastError = err;
      this.retryAt.set(tier, Date.now() + 1500); // не долбим сервер при сбое
    } finally {
      this.loading.delete(tier);
    }
  }
}
