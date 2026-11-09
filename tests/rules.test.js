import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadBlockFilter } from '../scripts/lib/blocklist.js';
import { computeDifficulty, isValidWord } from '../scripts/lib/wordRules.js';
import { segmentHitsRect, wordRect } from '../public/js/game/collision.js';
import { DifficultyManager, MODES, multiplierFor, pickTier } from '../public/js/game/difficulty.js';
import { validateGame } from '../server/validate.js';

test('isValidWord: алфавит, длина, гласные', () => {
  assert.ok(isValidWord('house', 'en'));
  assert.ok(isValidWord('корабль', 'ru'));
  assert.ok(isValidWord('ёжик', 'ru'));
  assert.equal(isValidWord('it', 'en'), false);                 // слишком короткое
  assert.equal(isValidWord('extraordinarily', 'en'), false);    // слишком длинное
  assert.equal(isValidWord('rhythm-', 'en'), false);            // не только буквы
  assert.equal(isValidWord('house', 'ru'), false);              // не тот алфавит
  assert.equal(isValidWord('hmm', 'en'), false);                // без гласных
  assert.equal(isValidWord('ааа', 'ru'), false);                // тройной повтор
  assert.equal(isValidWord('ыгра', 'ru'), false);               // не начинается с ы
});

test('computeDifficulty: растёт с длиной, редкие буквы повышают тир', () => {
  assert.equal(computeDifficulty('cat', 'en'), 1);
  assert.equal(computeDifficulty('planet', 'en'), 2);
  assert.equal(computeDifficulty('keyboard', 'en'), 3);
  assert.equal(computeDifficulty('adventures', 'en'), 4);
  assert.equal(computeDifficulty('extraordinary', 'en'), 5);
  assert.equal(computeDifficulty('jazz', 'en'), 2);             // длина 1 тир + 2 редкие буквы
  assert.equal(computeDifficulty('кот', 'ru'), 1);
  assert.equal(computeDifficulty('программа', 'ru'), 3);
  for (const w of ['a1', 'zzzzzzzzzzzzzz']) assert.ok(computeDifficulty(w.replace(/\d/g, 'a'), 'en') <= 5);
});

test('blocklist: базовые шаблоны режут нежелательные слова, обычные оставляют', () => {
  const en = loadBlockFilter('en', null);
  const ru = loadBlockFilter('ru', null);
  assert.equal(en('grape'), false);
  assert.equal(en('scrape'), false);
  assert.equal(en('apple'), false);
  assert.equal(en('porn'), true);
  assert.equal(ru('мудрость'), false);
  assert.equal(ru('корабль'), false);
  assert.equal(ru('пиздец'), true);
});

test('segmentHitsRect: быстрая пуля не пролетает сквозь слово', () => {
  const r = wordRect({ x: 200, y: 100, w: 80, h: 30 }); // x 160..240, y 70..100
  assert.ok(segmentHitsRect(200, 400, 200, 0, r));      // насквозь за один кадр
  assert.ok(segmentHitsRect(0, 85, 400, 85, r));
  assert.equal(segmentHitsRect(0, 0, 100, 0, r), false);
  assert.equal(segmentHitsRect(300, 400, 300, 0, r), false);
  assert.ok(segmentHitsRect(200, 85, 200, 85, r));      // вырожденный отрезок внутри
});

test('сложность: рост уровней, параметры монотонны и ограничены', () => {
  const dm = new DifficultyManager(MODES.classic);
  let prev = dm.params();
  for (let destroyed = 0; destroyed <= 200; destroyed += 12) {
    dm.update({ elapsed: 0, destroyed });
    const p = dm.params();
    assert.ok(p.fall >= prev.fall && p.spawn <= prev.spawn && p.tierMean >= prev.tierMean);
    assert.ok(p.fall <= 0.34 && p.spawn >= 0.75 && p.maxActive <= 9);
    prev = p;
  }
  assert.equal(dm.level, 10);                                // Классика ограничена 10 уровнями

  const timed = new DifficultyManager(MODES.survival);
  timed.update({ elapsed: 65, destroyed: 0 });
  assert.equal(timed.level, 4);                              // каждые 20 секунд

  const endless = new DifficultyManager(MODES.endless);
  endless.update({ elapsed: 0, destroyed: 60 });
  assert.equal(endless.level, 5);
  endless.dropLevels(2);
  assert.equal(endless.level, 3);
  endless.dropLevels(10);
  assert.equal(endless.level, 1);
});

test('множитель комбо и выбор тира', () => {
  assert.equal(multiplierFor(0), 1);
  assert.equal(multiplierFor(4), 1);
  assert.equal(multiplierFor(5), 2);
  assert.equal(multiplierFor(500), 8);
  const seq = [0, 0, 0];
  let i = 0;
  const rng = () => seq[i++ % 3];
  assert.equal(pickTier(1, rng), 1);
  for (let k = 0; k < 500; k++) {
    const t = pickTier(3, Math.random);
    assert.ok(t >= 1 && t <= 5);
  }
});

test('validateGame: принимает корректный результат и отклоняет мусор', () => {
  const good = {
    playerId: '3f1c9a52-7d0e-4c1b-9e51-0a1b2c3d4e5f', mode: 'classic', lang: 'ru', score: 1200,
    wordsDestroyed: 40, wordsMissed: 2, avgWpm: 42.34, maxWpm: 55, accuracy: 96.5, bestCombo: 18,
    level: 4, durationMs: 90000, victory: false,
  };
  const ok = validateGame(good);
  assert.ok(ok.value);
  assert.equal(ok.value.avgWpm, 42.3);
  assert.equal(validateGame({ ...good, mode: 'hack' }).error, 'invalid_mode');
  assert.equal(validateGame({ ...good, lang: 'de' }).error, 'invalid_lang');
  assert.equal(validateGame({ ...good, playerId: 'x' }).error, 'invalid_player');
  assert.equal(validateGame({ ...good, score: -5 }).error, 'invalid_score');
  assert.equal(validateGame({ ...good, accuracy: 140 }).error, 'invalid_accuracy');
  assert.equal(validateGame({ ...good, maxWpm: 'NaN' }).error, 'invalid_maxWpm');
  assert.equal(validateGame(null).error, 'invalid_body');
});
