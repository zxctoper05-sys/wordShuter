// Простой раннер миграций: применяет db/migrations/*.sql по порядку, каждую в транзакции.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../server/db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

async function main() {
  const client = await pool.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
    );
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    let applied = 0;
    for (const file of files) {
      if (done.has(file)) continue;
      console.log(`→ применяю ${file}`);
      const sql = await fs.readFile(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`${file}: ${err.message}`);
      }
    }
    console.log(applied ? `Готово: применено миграций — ${applied}` : 'Схема актуальна');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Ошибка миграции:', err.message);
  process.exit(1);
});
