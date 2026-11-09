import { pool, query } from '../db.js';

export async function saveGame(g) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO players (id) VALUES ($1)
       ON CONFLICT (id) DO UPDATE SET last_seen_at = now()`,
      [g.playerId],
    );
    const prev = (
      await client.query(
        `SELECT COALESCE(MAX(score), 0)::int AS score,
                COALESCE(MAX(max_wpm), 0)::float8 AS wpm,
                COALESCE(MAX(best_combo), 0)::int AS combo
           FROM games WHERE player_id = $1 AND mode = $2 AND lang = $3`,
        [g.playerId, g.mode, g.lang],
      )
    ).rows[0];
    const ins = await client.query(
      `INSERT INTO games (player_id, mode, lang, score, words_destroyed, words_missed, avg_wpm, max_wpm,
                          accuracy, best_combo, level_reached, duration_ms, victory)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [g.playerId, g.mode, g.lang, g.score, g.wordsDestroyed, g.wordsMissed, g.avgWpm, g.maxWpm,
        g.accuracy, g.bestCombo, g.level, g.durationMs, g.victory],
    );
    await client.query('COMMIT');
    return {
      id: String(ins.rows[0].id),
      records: {
        score: g.score > 0 && g.score > prev.score,
        wpm: g.maxWpm > 0 && g.maxWpm > prev.wpm + 0.05,
        combo: g.bestCombo > 0 && g.bestCombo > prev.combo,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function getPlayerStats(playerId) {
  const [totals, records, recent] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS games,
              COALESCE(SUM(words_destroyed), 0)::float8 AS words,
              COALESCE(SUM(duration_ms), 0)::float8 AS duration_ms,
              COALESCE(AVG(accuracy), 0)::float8 AS accuracy,
              COALESCE(MAX(max_wpm), 0)::float8 AS best_wpm,
              COALESCE(MAX(best_combo), 0)::int AS best_combo,
              COALESCE(MAX(score), 0)::int AS best_score
         FROM games WHERE player_id = $1`,
      [playerId],
    ),
    query(
      `SELECT mode, lang, MAX(score)::int AS best_score, MAX(max_wpm)::float8 AS best_wpm,
              MAX(best_combo)::int AS best_combo, COUNT(*)::int AS games
         FROM games WHERE player_id = $1 GROUP BY mode, lang ORDER BY mode, lang`,
      [playerId],
    ),
    query(
      `SELECT id, mode, lang, score, words_destroyed, avg_wpm, max_wpm, accuracy, best_combo,
              duration_ms, victory, created_at
         FROM games WHERE player_id = $1 ORDER BY created_at DESC, id DESC LIMIT 10`,
      [playerId],
    ),
  ]);
  const t = totals.rows[0];
  return {
    totals: {
      games: t.games, words: t.words, durationMs: t.duration_ms, accuracy: t.accuracy,
      bestWpm: t.best_wpm, bestCombo: t.best_combo, bestScore: t.best_score,
    },
    records: records.rows.map((r) => ({
      mode: r.mode, lang: r.lang, bestScore: r.best_score, bestWpm: r.best_wpm,
      bestCombo: r.best_combo, games: r.games,
    })),
    recent: recent.rows.map((r) => ({
      id: String(r.id), mode: r.mode, lang: r.lang, score: r.score, wordsDestroyed: r.words_destroyed,
      avgWpm: r.avg_wpm, maxWpm: r.max_wpm, accuracy: r.accuracy, bestCombo: r.best_combo,
      durationMs: r.duration_ms, victory: r.victory, createdAt: r.created_at,
    })),
  };
}
