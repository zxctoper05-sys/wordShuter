import { createApp } from './app.js';
import { LANGS, config } from './config.js';
import { pool } from './db.js';
import { getDictionaryInfo } from './services/words.js';

const app = createApp();

const server = app.listen(config.port, async () => {
  console.log(`Word Shooter → http://localhost:${config.port}`);
  try {
    const info = await getDictionaryInfo();
    for (const lang of LANGS) {
      if (!info[lang]?.total) {
        console.warn(`[warn] словарь '${lang}' пуст. Выполните: npm run dict:download && npm run dict:import`);
      }
    }
  } catch (err) {
    console.error(`[db] база недоступна: ${err.message}\n     Проверьте DATABASE_URL и выполните: npm run migrate`);
  }
});

function shutdown(signal) {
  console.log(`\n${signal}: останавливаю сервер…`);
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
