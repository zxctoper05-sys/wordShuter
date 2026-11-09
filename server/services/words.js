import { query } from '../db.js';

// Выборка случайных слов без ORDER BY random(): у каждого слова есть индексируемое
// случайное число rnd, берём окно слов начиная со случайной точки (с «заворотом»).
const BASE = `SELECT id, word FROM words
  WHERE lang = $1 AND difficulty = $2 AND length <= $3
    AND ($5::boolean IS FALSE OR is_common)
    AND NOT (id = ANY($6::int[]))`;
const FORWARD = `${BASE} AND rnd >= $4 ORDER BY rnd LIMIT $7`;
const WRAP = `${BASE} AND rnd < $4 ORDER BY rnd LIMIT $7`;

export async function getWordBatch({ lang, difficulty, count, maxLength, commonOnly, exclude }) {
  const start = Math.random();
  const first = await query(FORWARD, [lang, difficulty, maxLength, start, commonOnly, exclude, count]);
  let rows = first.rows;
  if (rows.length < count) {
    const rest = await query(WRAP, [lang, difficulty, maxLength, start, commonOnly, exclude, count - rows.length]);
    rows = rows.concat(rest.rows);
  }
  return rows.map((r) => ({ id: r.id, word: r.word }));
}

let cache = { at: 0, data: null };

export async function getDictionaryInfo() {
  if (cache.data && Date.now() - cache.at < 60_000) return cache.data;
  const { rows } = await query(
    `SELECT lang, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_common)::int AS common
       FROM words GROUP BY lang`,
  );
  const data = Object.fromEntries(rows.map((r) => [r.lang, { total: r.total, common: r.common }]));
  cache = { at: Date.now(), data };
  return data;
}
