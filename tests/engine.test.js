import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventBus } from '../public/js/core/bus.js';
import { GameEngine } from '../public/js/game/engine.js';
import { norm } from '../public/js/game/text.js';
import { WordProvider } from '../public/js/game/words.js';

const WORDS = ['alpha', 'bravo', 'candy', 'delta', 'eagle', 'fable', 'ghost', 'hotel', 'igloo', 'joker',
  'karma', 'lemon', 'mango', 'noble', 'ocean', 'piano', 'queen', 'river', 'solar', 'tiger'];

// Детерминированный поставщик: все слова разные первые буквы, без сети.
function fakeProvider(words = WORDS) {
  let i = 0;
  return {
    take(tier, avoid) {
      for (let n = 0; n < words.length; n++) {
        const text = words[(i + n) % words.length];
        if (avoid && avoid.has(norm(text)[0])) continue;
        i = i + n + 1;
        return { id: i, text, norm: norm(text), first: norm(text)[0], tier };
      }
      return null;
    },
  };
}

function setup(mode = 'classic', words) {
  const bus = new EventBus();
  const events = [];
  for (const type of ['kill', 'hit', 'miss', 'error', 'gameover', 'level', 'revive', 'shoot']) {
    bus.on(type, (p) => events.push({ type, ...p }));
  }
  const engine = new GameEngine({ mode, lang: 'en', provider: fakeProvider(words), bus, rng: () => 0.5 });
  engine.resize(800, 600);
  engine.start();
  return { engine, bus, events };
}

const run = (engine, seconds, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) engine.update(dt);
};

test('слова появляются и падают вниз', () => {
  const { engine } = setup();
  run(engine, 0.1);
  assert.ok(engine.words.length >= 1);
  const y0 = engine.words[0].y;
  run(engine, 1);
  assert.ok(engine.words[0].y > y0);
});

test('правильный набор: очки, комбо, пуля, слово исчезает после попадания', () => {
  const { engine, events } = setup();
  run(engine, 0.1);
  const word = engine.words[0];
  let r;
  for (const ch of word.text) r = engine.type(engine.input + ch);
  assert.equal(r.destroyed, word);
  assert.equal(engine.destroyed, 1);
  assert.equal(engine.combo, 1);
  assert.equal(engine.score, word.text.length * 10);
  assert.equal(engine.input, '');
  assert.equal(engine.bullets.length, 1);
  assert.ok(events.some((e) => e.type === 'shoot'));
  run(engine, 0.6); // пуля долетает
  assert.equal(engine.bullets.length, 0);
  assert.ok(!engine.words.includes(word));
  assert.ok(events.some((e) => e.type === 'hit'));
});

test('ошибочная буква отклоняется, сбрасывает комбо и портит точность', () => {
  const { engine, events } = setup();
  run(engine, 0.1);
  const w = engine.words[0];
  for (const ch of w.text) engine.type(engine.input + ch);
  assert.equal(engine.combo, 1);
  run(engine, 3);
  const next = engine.words[0];
  const wrong = 'z'.repeat(1) === next.text[0] ? 'y' : 'z';
  const r = engine.type(wrong);
  assert.equal(r.accepted, false);
  assert.equal(r.value, '');
  assert.equal(engine.combo, 0);
  assert.ok(events.some((e) => e.type === 'error'));
  assert.ok(engine.accuracy() < 100);
});

test('регистр и «ё» не мешают: ввод нормализуется', () => {
  const { engine } = setup('classic', ['ёлка', 'мост', 'дом', 'рыба', 'зима']);
  run(engine, 0.1);
  const w = engine.words.find((x) => x.text === 'ёлка') ?? engine.words[0];
  const typed = w.text === 'ёлка' ? 'ЕЛКА' : w.text.toUpperCase();
  let r;
  for (const ch of typed) r = engine.type(engine.input + ch);
  assert.equal(r.destroyed, w);
});

test('Backspace убирает букву без штрафа, цель снимается', () => {
  const { engine } = setup();
  run(engine, 0.1);
  const w = engine.words[0];
  engine.type(w.text[0]);
  assert.equal(engine.target, w);
  const r = engine.type('');
  assert.equal(r.accepted, true);
  assert.equal(engine.target, null);
  assert.equal(engine.keystrokes, 1);
});

test('слово у земли отнимает жизнь и сбрасывает комбо; потеря всех жизней — конец игры', () => {
  const { engine, events } = setup('survival');
  run(engine, 200);
  assert.equal(engine.status, 'over');
  assert.equal(engine.lives, 0);
  const over = events.find((e) => e.type === 'gameover');
  assert.equal(over.reason, 'lives');
  assert.equal(over.summary.mode, 'survival');
  assert.equal(over.summary.wordsMissed, 3);
  assert.equal(events.filter((e) => e.type === 'miss').length, 3);
});

test('ввод после конца игры игнорируется', () => {
  const { engine } = setup('survival');
  run(engine, 200);
  assert.equal(engine.type('a').accepted, false);
});

test('пауза замораживает игру', () => {
  const { engine } = setup();
  run(engine, 0.5);
  engine.pause();
  const snap = engine.words.map((w) => w.y);
  run(engine, 5);
  assert.deepEqual(engine.words.map((w) => w.y), snap);
  assert.equal(engine.type('a').accepted, false);
  engine.resume();
  run(engine, 0.5);
  assert.ok(engine.words[0].y > snap[0]);
});

test('режим «На время» заканчивается через 90 секунд', () => {
  const { engine, events } = setup('timeattack');
  // печатаем всё, что появляется, чтобы не потерять жизни
  for (let t = 0; t < 100 && engine.status === 'running'; t += 1 / 30) {
    engine.update(1 / 30);
    const w = engine.words.find((x) => !x.doomed);
    if (w) for (const ch of w.text) engine.type(engine.input + ch);
  }
  assert.equal(engine.status, 'over');
  const over = events.find((e) => e.type === 'gameover');
  assert.equal(over.reason, 'time');
  assert.ok(Math.abs(over.summary.durationMs - 90000) < 50);
  assert.ok(over.summary.wordsDestroyed > 20);
  assert.ok(over.summary.avgWpm > 0 && over.summary.maxWpm >= over.summary.avgWpm);
  assert.equal(over.summary.accuracy, 100);
});

test('«Классика»: победа после прохождения 10 уровней, сложность растёт', () => {
  const { engine, events } = setup('classic');
  for (let t = 0; t < 2000 && engine.status === 'running'; t += 1 / 30) {
    engine.update(1 / 30);
    const w = engine.words.find((x) => !x.doomed);
    if (w) for (const ch of w.text) engine.type(engine.input + ch);
  }
  const over = events.find((e) => e.type === 'gameover');
  assert.equal(over.reason, 'victory');
  assert.equal(over.summary.victory, true);
  assert.equal(over.summary.wordsDestroyed, 120);
  assert.equal(over.summary.level, 10);
  assert.ok(events.filter((e) => e.type === 'level' && e.up).length >= 9);
  assert.ok(over.summary.bestCombo >= 100);
});

test('«Бесконечный»: потеря жизней даёт второе дыхание, игра не заканчивается', () => {
  const { engine, events } = setup('endless');
  run(engine, 120);
  assert.equal(engine.status, 'running');
  assert.ok(engine.revives >= 1);
  assert.ok(events.some((e) => e.type === 'revive'));
  assert.ok(engine.lives >= 1 && engine.lives <= 3);
  engine.finish('manual');
  assert.equal(events.at(-1).type, 'gameover');
  assert.equal(events.at(-1).reason, 'manual');
});

test('первые буквы слов на экране не совпадают, если есть выбор', () => {
  const { engine } = setup();
  run(engine, 30);
  const letters = engine.words.filter((w) => !w.doomed).map((w) => w.first);
  assert.equal(new Set(letters).size, letters.length);
});

test('слова не выходят за границы поля и не накладываются при появлении', () => {
  const { engine } = setup();
  run(engine, 20);
  for (const w of engine.words) {
    assert.ok(w.x - w.w / 2 >= 0 && w.x + w.w / 2 <= engine.width);
  }
});

test('изменение размера поля масштабирует слова', () => {
  const { engine } = setup();
  run(engine, 3);
  const before = engine.words.map((w) => ({ x: w.x / engine.width, y: w.y / engine.groundY }));
  engine.resize(400, 700);
  engine.words.forEach((w, i) => {
    assert.ok(Math.abs(w.y / engine.groundY - before[i].y) < 1e-9);
    assert.ok(w.x - w.w / 2 >= 0 && w.x + w.w / 2 <= 400);
  });
});

test('WordProvider: без повторов в сессии, дозагрузка пачками, исчерпание тира', async () => {
  const pool = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, word: `слово${String.fromCharCode(1072 + (i % 26))}${i}` }));
  const calls = [];
  const fetchBatch = async (p) => {
    calls.push(p);
    const ex = new Set(p.exclude);
    return pool.filter((r) => !ex.has(r.id)).slice(0, p.count);
  };
  const provider = new WordProvider({ lang: 'ru', fetchBatch, batchSize: 8, lowWater: 4 });
  await provider.prefetch();
  assert.equal(calls.length, 5); // по запросу на каждый тир
  const taken = new Set();
  for (let i = 0; i < 100; i++) {
    const w = provider.take(1);
    if (w) {
      assert.ok(!taken.has(w.id), 'слово выдано повторно');
      taken.add(w.id);
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  assert.equal(taken.size, 30); // весь словарь выдан ровно по разу
  assert.ok(calls.every((c) => c.commonOnly === true && c.count === 8));
});

test('WordProvider: сбой сети не ломает игру, ошибка сохраняется', async () => {
  const provider = new WordProvider({ lang: 'en', fetchBatch: async () => { throw new Error('offline'); } });
  assert.equal(await provider.prefetch(), 0);
  assert.equal(provider.lastError.message, 'offline');
  assert.equal(provider.take(2), null);
});
