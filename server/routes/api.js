import { Router } from 'express';
import { LANGS, config } from '../config.js';
import { query } from '../db.js';
import { rateLimit } from '../middleware.js';
import { clampInt, isUuid, validateGame } from '../validate.js';
import { getDictionaryInfo, getWordBatch } from '../services/words.js';
import { getPlayerStats, saveGame } from '../services/stats.js';

const router = Router();
const bad = (res, error) => res.status(400).json({ error });
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

router.get('/health', wrap(async (req, res) => {
  await query('SELECT 1');
  res.json({ ok: true });
}));

// Сколько слов в словарях — клиент показывает это в меню и блокирует пустые языки.
router.get('/dictionaries', wrap(async (req, res) => {
  res.json({ dictionaries: await getDictionaryInfo() });
}));

// Пачка слов для игровой сессии. exclude — id уже выданных слов (без повторов в сессии).
router.post('/words/batch', rateLimit({ max: 600 }), wrap(async (req, res) => {
  const b = req.body ?? {};
  if (!LANGS.includes(b.lang)) return bad(res, 'invalid_lang');
  const difficulty = Number(b.difficulty);
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) return bad(res, 'invalid_difficulty');
  const exclude = Array.isArray(b.exclude)
    ? b.exclude.filter((n) => Number.isInteger(n) && n > 0).slice(-config.maxExclude)
    : [];
  const words = await getWordBatch({
    lang: b.lang,
    difficulty,
    count: clampInt(b.count, 1, config.maxBatch, 30),
    maxLength: clampInt(b.maxLength, 3, 32, 14),
    commonOnly: b.commonOnly !== false,
    exclude,
  });
  res.json({ words });
}));

router.post('/games', rateLimit({ max: 60 }), wrap(async (req, res) => {
  const { value, error } = validateGame(req.body);
  if (error) return bad(res, error);
  res.status(201).json(await saveGame(value));
}));

router.get('/players/:id/stats', rateLimit({ max: 120 }), wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return bad(res, 'invalid_player');
  res.json(await getPlayerStats(req.params.id));
}));

router.use((req, res) => res.status(404).json({ error: 'not_found' }));

export default router;
