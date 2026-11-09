// Импорт словарей в PostgreSQL: очистка, дедупликация, фильтр нежелательных слов, сложность.
//   npm run dict:import                          — все языки из dictionaries.config.js
//   npm run dict:import -- --lang=ru             — один язык
//   npm run dict:import -- --common-only         — только частотные слова (маленькая БД)
//   npm run dict:import -- --lang=en --file=my.txt [--common] [--source=name]  — свой файл
//   Дополнительно: --truncate (очистить язык перед импортом), --min-length=3, --max-length=14
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../server/db.js';
import { SOURCES } from './dictionaries.config.js';
import { parseArgs } from './lib/args.js';
import { loadBlockFilter } from './lib/blocklist.js';
import { computeDifficulty, isValidWord, normalizeWord } from './lib/wordRules.js';

const rawDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/raw');
const args = parseArgs(process.argv.slice(2));
const limits = { minLength: Number(args['min-length'] ?? 3), maxLength: Number(args['max-length'] ?? 14) };
const BATCH = 10_000;

function readList(file, limit) {
  const full = path.isAbsolute(file) ? file : path.join(rawDir, file);
  if (!fs.existsSync(full)) return null;
  const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
  return limit ? lines.slice(0, limit) : lines;
}

/** Строка файла → нормализованное слово (берём первый токен: поддерживает формат «слово частота»). */
const token = (line) => normalizeWord(line.split(/\s+/, 1)[0] ?? '');

function collect(lang, { files, commonFiles, commonOnly }) {
  const blocked = loadBlockFilter(lang, path.join(rawDir, SOURCES[lang]?.blocklist?.file ?? `${lang}-blocklist.txt`));
  const ok = (w) => isValidWord(w, lang, limits) && !blocked(w);
  const stats = { read: 0, kept: 0 };

  // Полный словарь — база для проверки «настоящести» частотных слов.
  const main = new Map();
  if (!commonOnly) {
    for (const f of files) {
      const lines = readList(f.file);
      if (!lines) { console.warn(`  ! нет файла ${f.file} (npm run dict:download)`); continue; }
      stats.read += lines.length;
      for (const line of lines) {
        const w = token(line);
        if (w && ok(w) && !main.has(w)) main.set(w, f.source);
      }
    }
  }

  const result = new Map();
  for (const f of commonFiles) {
    const lines = readList(f.file, f.limit);
    if (!lines) { console.warn(`  ! нет файла ${f.file} (npm run dict:download)`); continue; }
    stats.read += lines.length;
    for (const line of lines) {
      const w = token(line);
      if (!w || !ok(w)) continue;
      if (main.size && !main.has(w)) continue; // частотный список содержит опечатки и сокращения — сверяем со словарём
      result.set(w, { common: true, source: f.source });
    }
  }
  for (const [w, source] of main) if (!result.has(w)) result.set(w, { common: false, source });
  stats.kept = result.size;
  return { words: result, stats };
}

async function upsert(client, lang, entries) {
  for (let i = 0; i < entries.length; i += BATCH) {
    const chunk = entries.slice(i, i + BATCH);
    await client.query(
      `INSERT INTO words (lang, word, length, difficulty, is_common, source)
       SELECT $1::varchar, w, l, d, c, s
         FROM unnest($2::text[], $3::int[], $4::int[], $5::bool[], $6::text[]) AS t(w, l, d, c, s)
       ON CONFLICT (lang, word)
       DO UPDATE SET difficulty = EXCLUDED.difficulty, is_common = EXCLUDED.is_common, source = EXCLUDED.source`,
      [
        lang,
        chunk.map(([w]) => w),
        chunk.map(([w]) => w.length),
        chunk.map(([w]) => computeDifficulty(w, lang)),
        chunk.map(([, m]) => m.common),
        chunk.map(([, m]) => m.source),
      ],
    );
    process.stdout.write(`\r  записано ${Math.min(i + BATCH, entries.length)} / ${entries.length}`);
  }
  process.stdout.write('\n');
}

async function importLanguage(client, lang) {
  const cfg = SOURCES[lang];
  let plan;
  if (args.file) {
    plan = {
      files: args.common ? [] : [{ file: String(args.file), source: String(args.source ?? 'custom') }],
      commonFiles: args.common ? [{ file: String(args.file), source: String(args.source ?? 'custom') }] : [],
      commonOnly: Boolean(args.common),
    };
  } else {
    plan = { files: cfg.main, commonFiles: cfg.common, commonOnly: Boolean(args['common-only']) };
  }

  console.log(`[${lang}] читаю и очищаю списки…`);
  const { words, stats } = collect(lang, plan);
  if (!words.size) throw new Error(`для языка ${lang} не найдено ни одного слова — выполните npm run dict:download`);
  console.log(`  прочитано строк: ${stats.read}, подходящих слов: ${stats.kept}`);

  await client.query('BEGIN');
  try {
    if (args.truncate) await client.query('DELETE FROM words WHERE lang = $1', [lang]);
    await upsert(client, lang, [...words]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  const { rows } = await client.query(
    `SELECT difficulty, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_common)::int AS common
       FROM words WHERE lang = $1 GROUP BY difficulty ORDER BY difficulty`,
    [lang],
  );
  console.log('  сложность │ всего │ частотных');
  for (const r of rows) console.log(`      ${r.difficulty}     │ ${String(r.total).padStart(6)} │ ${String(r.common).padStart(6)}`);
}

async function main() {
  const langs = args.lang && args.lang !== 'all' ? String(args.lang).split(',') : Object.keys(SOURCES);
  for (const lang of langs) {
    if (!SOURCES[lang] && !args.file) throw new Error(`неизвестный язык «${lang}» (добавьте его в scripts/dictionaries.config.js)`);
  }
  const client = await pool.connect();
  try {
    for (const lang of langs) await importLanguage(client, lang);
    await client.query('ANALYZE words');
    console.log('\nИмпорт завершён.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\nОшибка импорта:', err.message);
  process.exit(1);
});
