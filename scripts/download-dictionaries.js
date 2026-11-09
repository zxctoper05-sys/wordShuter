// Скачивает открытые словари в data/raw/ (UTF-8). Запускается один раз при установке,
// во время игры внешние источники не используются.
//   npm run dict:download [-- --lang=ru,en --force]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES } from './dictionaries.config.js';
import { parseArgs } from './lib/args.js';

const rawDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/raw');
const args = parseArgs(process.argv.slice(2));
const langs = args.lang && args.lang !== 'all' ? String(args.lang).split(',') : Object.keys(SOURCES);

async function download(entry) {
  const dest = path.join(rawDir, entry.file);
  if (!args.force) {
    try {
      const st = await fs.stat(dest);
      if (st.size > 0) return console.log(`  = ${entry.file} уже есть (${(st.size / 1024).toFixed(0)} КБ), пропускаю`), true;
    } catch { /* файла нет — скачиваем */ }
  }
  for (const url of entry.urls) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = new TextDecoder(entry.encoding ?? 'utf-8').decode(Buffer.from(await res.arrayBuffer()));
      await fs.writeFile(dest, text, 'utf8');
      console.log(`  ✓ ${entry.file} ← ${url} (${(text.length / 1024).toFixed(0)} КБ)`);
      return true;
    } catch (err) {
      console.warn(`  ✗ ${url}: ${err.message}`);
    }
  }
  return false;
}

async function main() {
  await fs.mkdir(rawDir, { recursive: true });
  let failed = false;
  for (const lang of langs) {
    const cfg = SOURCES[lang];
    if (!cfg) {
      console.error(`Неизвестный язык: ${lang}`);
      failed = true;
      continue;
    }
    console.log(`[${lang}] ${cfg.label}`);
    for (const entry of [...cfg.main, ...cfg.common]) if (!(await download(entry))) failed = true;
    if (cfg.blocklist && !(await download(cfg.blocklist))) {
      console.warn('  (список нежелательных слов не скачан — будут применены только встроенные шаблоны)');
    }
  }
  if (failed) {
    console.error('\nНе все словари скачаны. Проверьте интернет-соединение и повторите команду.');
    process.exit(1);
  }
  console.log('\nГотово. Теперь: npm run dict:import');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
