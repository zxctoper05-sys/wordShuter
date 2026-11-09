// Игровой движок: чистая логика без DOM и Canvas (поэтому его можно тестировать в Node).
// Координаты — CSS-пиксели поля. Слово: x — центр, y — нижняя (базовая) линия.
import { bus as defaultBus } from '../core/bus.js';
import { segmentHitsRect, wordRect } from './collision.js';
import { clamp, DifficultyManager, MODES, multiplierFor, pickTier } from './difficulty.js';
import { norm } from './text.js';

const WPM_WINDOW = 20; // секунд для «текущего» WPM

export class GameEngine {
  constructor({ mode, lang, provider, bus = defaultBus, measure = (t) => t.length * 14 + 16, wordHeight = 30, rng = Math.random }) {
    this.mode = typeof mode === 'string' ? MODES[mode] : mode;
    this.lang = lang;
    this.provider = provider;
    this.bus = bus;
    this.measure = measure;
    this.wordHeight = wordHeight;
    this.rng = rng;

    this.difficulty = new DifficultyManager(this.mode);
    this.params = this.difficulty.params();

    this.width = 800;
    this.height = 600;
    this.#layout();

    this.status = 'ready'; // ready | running | paused | over
    this.words = [];
    this.bullets = [];
    this.target = null;
    this.input = '';

    this.score = 0;
    this.lives = this.mode.lives;
    this.combo = 0;
    this.bestCombo = 0;
    this.destroyed = 0;
    this.missed = 0;
    this.revives = 0;
    this.keystrokes = 0;
    this.correctKeys = 0;
    this.elapsed = 0;
    this.peakLevel = 1;

    this.totalChars = 0;
    this.charLog = [];
    this.maxWpm = 0;
    this.wpmTimer = 0;
    this.spawnTimer = 0;
    this._crossed = [];
  }

  // ───────────── поле и метрики ─────────────

  #layout() {
    this.zone = clamp(this.height * 0.14, 46, 88);   // высота «базы» с пушкой
    this.groundY = this.height - this.zone;
    this.pivotX = this.width / 2;
    this.pivotY = this.height - this.zone * 0.38;
    this.barrel = this.zone * 0.7;
    this.widthCap = this.width < 520 ? 5 : this.width < 900 ? 7 : 9;
  }

  setMetrics({ measure, wordHeight }) {
    if (measure) this.measure = measure;
    if (wordHeight) this.wordHeight = wordHeight;
    for (const w of this.words) {
      w.w = this.measure(w.text);
      w.h = this.wordHeight;
    }
  }

  resize(width, height) {
    const ow = this.width;
    const og = this.groundY;
    this.width = width;
    this.height = height;
    this.#layout();
    for (const w of this.words) {
      w.x = clamp((w.x * width) / ow, w.w / 2 + 4, Math.max(w.w / 2 + 4, width - w.w / 2 - 4));
      w.y *= this.groundY / og;
      w.w = this.measure(w.text);
      w.h = this.wordHeight;
    }
  }

  // ───────────── жизненный цикл ─────────────

  start() {
    if (this.status === 'ready') this.status = 'running';
  }

  pause() {
    if (this.status === 'running') this.status = 'paused';
  }

  resume() {
    if (this.status === 'paused') this.status = 'running';
  }

  finish(reason = 'manual') {
    if (this.status === 'over') return;
    this.#finish(reason);
  }

  #finish(reason) {
    this.status = 'over';
    for (const w of this.words.filter((x) => x.doomed)) this.#explode(w); // доигрываем уже поражённые слова
    this.bullets.length = 0;
    this.bus.emit('gameover', { reason, summary: this.summary(reason) });
  }

  // ───────────── обновление кадра ─────────────

  update(dt) {
    if (this.status !== 'running') return;
    this.elapsed += dt;

    const lv = this.difficulty.update({ elapsed: this.elapsed, destroyed: this.destroyed });
    if (lv.changed) {
      this.params = this.difficulty.params();
      this.peakLevel = Math.max(this.peakLevel, this.difficulty.level);
      this.bus.emit('level', { level: this.difficulty.level, up: lv.up });
    }

    if (this.mode.timeLimit && this.elapsed >= this.mode.timeLimit) {
      this.elapsed = this.mode.timeLimit;
      this.#finish('time');
      return;
    }

    // появление слов
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.#activeCount() < Math.min(this.params.maxActive, this.widthCap)) {
      this.spawnTimer = this.#spawn() ? this.params.spawn * (0.8 + this.rng() * 0.4) : 0.25;
    }

    // падение слов
    const fall = this.params.fall * this.groundY;
    const crossed = this._crossed;
    crossed.length = 0;
    for (const w of this.words) {
      w.y += fall * w.speed * dt;
      if (w.y >= this.groundY) crossed.push(w);
    }
    for (const w of crossed) {
      if (w.dead) continue; // слово уже убрано (например, «второе дыхание» очистило поле)
      if (w.doomed) this.#explode(w);
      else this.#miss(w);
      if (this.status !== 'running') return;
    }

    this.#updateBullets(dt);

    // WPM: считаем 2 раза в секунду
    this.wpmTimer += dt;
    if (this.wpmTimer >= 0.5) {
      this.wpmTimer = 0;
      if (this.elapsed >= 8) this.maxWpm = Math.max(this.maxWpm, this.currentWpm());
    }
  }

  #activeCount() {
    let n = 0;
    for (const w of this.words) if (!w.doomed) n++;
    return n;
  }

  #spawn() {
    const avoid = new Set();
    for (const w of this.words) if (!w.doomed) avoid.add(w.first);
    const src = this.provider.take(pickTier(this.params.tierMean, this.rng), avoid);
    if (!src) return false;

    const width = this.measure(src.text);
    const h = this.wordHeight;
    const minX = width / 2 + 8;
    const maxX = this.width - width / 2 - 8;
    let x = this.width / 2;
    if (maxX > minX) {
      // несколько попыток выбрать место, где слово не наезжает на недавно появившиеся
      let best = Infinity;
      for (let i = 0; i < 8; i++) {
        const cx = minX + this.rng() * (maxX - minX);
        let score = 0;
        for (const o of this.words) {
          if (o.y > h * 3.2) continue;
          const overlap = (width + o.w) / 2 + 12 - Math.abs(cx - o.x);
          if (overlap > 0) score += overlap;
        }
        if (score < best) {
          best = score;
          x = cx;
          if (score === 0) break;
        }
      }
    }
    this.words.push({
      id: src.id, text: src.text, norm: src.norm, first: src.first, tier: src.tier,
      x, y: 0, w: width, h, speed: 0.9 + this.rng() * 0.25, doomed: false, dead: false,
    });
    return true;
  }

  // ───────────── ввод ─────────────

  /**
   * Принимает новое значение поля ввода. Возвращает { accepted, value, destroyed? }:
   * value — что должно остаться в поле (неверная буква отклоняется).
   */
  type(raw) {
    const prev = this.input;
    if (this.status !== 'running') return { accepted: false, value: prev };
    const v = norm(String(raw)).replace(/[^\p{L}]/gu, '');
    if (v === prev) return { accepted: true, value: prev };

    if (prev.startsWith(v)) { // Backspace
      this.input = v;
      this.#refreshTarget();
      return { accepted: true, value: this.input };
    }

    const added = v.startsWith(prev) ? v.length - prev.length : 1;
    this.keystrokes += added;
    const candidates = this.words.filter((w) => !w.doomed && w.norm.startsWith(v));
    if (!candidates.length) {
      this.combo = 0;
      this.bus.emit('error', { char: v.slice(-1) });
      return { accepted: false, value: prev };
    }
    this.correctKeys += added;
    this.input = v;

    let hit = null;
    for (const w of candidates) if (w.norm === v && (!hit || w.y > hit.y)) hit = w;
    if (hit) {
      this.input = '';
      this.#kill(hit);
      return { accepted: true, value: '', destroyed: hit };
    }
    this.#refreshTarget();
    return { accepted: true, value: v };
  }

  /** Цель — слово, начало которого набрано; при совпадении нескольких — самое низкое. */
  #refreshTarget() {
    let best = null;
    if (this.input) {
      for (const w of this.words) {
        if (!w.doomed && w.norm.startsWith(this.input) && (!best || w.y > best.y)) best = w;
      }
      if (!best) {
        this.input = '';
        this.bus.emit('inputreset');
      }
    }
    this.target = best;
  }

  #kill(w) {
    w.doomed = true;
    this.destroyed++;
    this.combo++;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    const multiplier = multiplierFor(this.combo);
    const points = Math.round(w.text.length * 10 * multiplier);
    this.score += points;

    const chars = w.text.length + 1; // +1 за пробел — стандартное определение WPM
    this.totalChars += chars;
    this.charLog.push({ t: this.elapsed, n: chars });
    while (this.charLog.length && this.elapsed - this.charLog[0].t > WPM_WINDOW) this.charLog.shift();

    this.#fire(w);
    this.bus.emit('kill', { word: w, points, combo: this.combo, multiplier, x: w.x, y: w.y - w.h / 2 });
    if (this.combo % 10 === 0) this.bus.emit('combo', { combo: this.combo, multiplier });
    this.#refreshTarget();

    if (this.mode.victory && this.destroyed >= this.mode.maxLevel * this.mode.perLevel) this.#finish('victory');
  }

  // ───────────── пули и попадания ─────────────

  #fire(w) {
    const ty = w.y - w.h / 2;
    const angle = clamp(Math.atan2(w.x - this.pivotX, this.pivotY - ty), -1.25, 1.25);
    const x = this.pivotX + Math.sin(angle) * this.barrel;
    const y = this.pivotY - Math.cos(angle) * this.barrel;
    this.bullets.push({ x, y, dx: Math.sin(angle), dy: -Math.cos(angle), speed: Math.max(1500, this.height * 3), target: w });
    this.bus.emit('shoot', { x, y, angle });
  }

  #updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const w = b.target;
      if (w.dead) {
        this.bullets.splice(i, 1);
        continue;
      }
      const tx = w.x;
      const ty = w.y - w.h / 2;
      const vx = tx - b.x;
      const vy = ty - b.y;
      const dist = Math.hypot(vx, vy) || 1;
      const step = b.speed * dt;
      const reached = dist <= step;
      const nx = reached ? tx : b.x + (vx / dist) * step;
      const ny = reached ? ty : b.y + (vy / dist) * step;
      b.dx = vx / dist;
      b.dy = vy / dist;
      const hit = reached || segmentHitsRect(b.x, b.y, nx, ny, wordRect(w));
      b.x = nx;
      b.y = ny;
      if (hit) {
        this.bullets.splice(i, 1);
        this.#explode(w);
      }
    }
  }

  #removeWord(w) {
    w.dead = true;
    const i = this.words.indexOf(w);
    if (i >= 0) this.words.splice(i, 1);
  }

  #explode(w) {
    this.#removeWord(w);
    this.bus.emit('hit', { x: w.x, y: w.y - w.h / 2, w: w.w, tier: w.tier, text: w.text });
  }

  // ───────────── промахи, жизни ─────────────

  #miss(w) {
    this.#removeWord(w);
    this.lives--;
    this.missed++;
    this.combo = 0;
    this.bus.emit('miss', { word: w, x: w.x, y: this.groundY, lives: this.lives });
    this.#refreshTarget();
    if (this.lives > 0) return;
    if (this.mode.revive) this.#revive();
    else this.#finish('lives');
  }

  /** Эндлесс: «второе дыхание» — жизни восстанавливаются, сложность падает, поле очищается. */
  #revive() {
    this.revives++;
    this.lives = this.mode.lives;
    this.difficulty.dropLevels(2);
    this.params = this.difficulty.params();
    for (const w of this.words.filter((x) => !x.doomed)) {
      this.bus.emit('purge', { x: w.x, y: w.y - w.h / 2 });
      this.#removeWord(w);
    }
    this.bus.emit('revive', { lives: this.lives, level: this.difficulty.level });
    this.bus.emit('level', { level: this.difficulty.level, up: false });
    this.#refreshTarget();
  }

  // ───────────── статистика ─────────────

  currentWpm() {
    let chars = 0;
    for (let i = this.charLog.length - 1; i >= 0; i--) {
      if (this.elapsed - this.charLog[i].t > WPM_WINDOW) break;
      chars += this.charLog[i].n;
    }
    const span = Math.max(5, Math.min(WPM_WINDOW, this.elapsed));
    return chars / 5 / (span / 60);
  }

  accuracy() {
    return this.keystrokes ? (this.correctKeys / this.keystrokes) * 100 : 100;
  }

  snapshot() {
    return {
      status: this.status,
      score: this.score,
      lives: this.lives,
      maxLives: this.mode.lives,
      combo: this.combo,
      multiplier: multiplierFor(this.combo),
      destroyed: this.destroyed,
      level: this.difficulty.level,
      wpm: Math.round(this.currentWpm()),
      accuracy: Math.round(this.accuracy()),
      elapsed: this.elapsed,
      timeLeft: this.mode.timeLimit ? Math.max(0, this.mode.timeLimit - this.elapsed) : null,
    };
  }

  summary(reason = 'manual') {
    const avg = this.elapsed > 0 ? Math.min(400, this.totalChars / 5 / (this.elapsed / 60)) : 0;
    const round1 = (n) => Math.round(n * 10) / 10;
    return {
      mode: this.mode.id,
      lang: this.lang,
      reason,
      victory: reason === 'victory',
      score: this.score,
      wordsDestroyed: this.destroyed,
      wordsMissed: this.missed,
      avgWpm: round1(avg),
      maxWpm: round1(Math.min(400, Math.max(this.maxWpm, avg))),
      accuracy: round1(this.accuracy()),
      bestCombo: this.bestCombo,
      level: Math.max(1, this.peakLevel, this.difficulty.level),
      durationMs: Math.round(this.elapsed * 1000),
    };
  }
}
