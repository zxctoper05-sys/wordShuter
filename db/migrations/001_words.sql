-- Словари. Одна таблица на все языки: добавить язык = импортировать слова с новым кодом lang.
CREATE TABLE words (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lang       VARCHAR(8)  NOT NULL,
  word       VARCHAR(32) NOT NULL,
  length     SMALLINT    NOT NULL,
  difficulty SMALLINT    NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  is_common  BOOLEAN     NOT NULL DEFAULT FALSE,
  rnd        DOUBLE PRECISION NOT NULL DEFAULT random(),
  source     VARCHAR(64),
  UNIQUE (lang, word)
);

-- Быстрая выборка случайного окна слов: (язык, сложность) + порядок по rnd.
CREATE INDEX words_pick_idx        ON words (lang, difficulty, rnd);
CREATE INDEX words_pick_common_idx ON words (lang, difficulty, rnd) WHERE is_common;
CREATE INDEX words_length_idx      ON words (lang, length);
