-- Игроки пока анонимные (UUID из браузера). Для аккаунтов позже достаточно добавить
-- в players колонки user_id / email и привязать UUID к учётной записи.
CREATE TABLE players (
  id           UUID PRIMARY KEY,
  nickname     VARCHAR(32),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE games (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id       UUID        NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  mode            VARCHAR(16) NOT NULL,
  lang            VARCHAR(8)  NOT NULL,
  score           INTEGER     NOT NULL,
  words_destroyed INTEGER     NOT NULL,
  words_missed    INTEGER     NOT NULL DEFAULT 0,
  avg_wpm         REAL        NOT NULL,
  max_wpm         REAL        NOT NULL,
  accuracy        REAL        NOT NULL,
  best_combo      INTEGER     NOT NULL,
  level_reached   INTEGER     NOT NULL,
  duration_ms     INTEGER     NOT NULL,
  victory         BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX games_player_idx      ON games (player_id, created_at DESC);
-- Готово для онлайн-таблиц лидеров и ежедневных испытаний.
CREATE INDEX games_leaderboard_idx ON games (mode, lang, score DESC);
