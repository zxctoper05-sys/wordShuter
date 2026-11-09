// Игровая сессия: связывает движок, поставщик слов, рендерер и эффекты; владеет циклом rAF.
import { api } from '../core/api.js';
import { bus } from '../core/bus.js';
import { t } from '../core/i18n.js';
import { Effects } from './effects.js';
import { GameEngine } from './engine.js';
import { Renderer } from './renderer.js';
import { WordProvider } from './words.js';

export class GameSession {
  constructor(canvas) {
    this.canvas = canvas;
    this.effects = new Effects();
    this.renderer = new Renderer(canvas, this.effects);
    this.engine = null;
    this.provider = null;
    this.onHud = null;
    this.raf = 0;
    this.last = 0;
    this.hudAt = 0;
    this.unsubs = [];
    this.frame = this.frame.bind(this);
  }

  async init({ mode, lang, commonOnly, effects, shake }) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.effects.enabled = effects;
    this.effects.shakeEnabled = shake && !reduced;
    this.resize();

    const provider = new WordProvider({
      lang,
      commonOnly,
      maxLength: this.renderer.maxWordChars(),
      fetchBatch: (params) => api.fetchWords(params),
    });
    const total = await provider.prefetch();
    if (!total) {
      provider.destroy();
      throw Object.assign(new Error('no words'), { code: provider.lastError ? 'network' : 'empty' });
    }
    this.provider = provider;

    const engine = new GameEngine({ mode, lang, provider, bus });
    engine.setMetrics({ measure: this.renderer.measure, wordHeight: this.renderer.wordH });
    engine.resize(this.renderer.W, this.renderer.H);
    this.engine = engine;
    this.renderer.attach(engine);
    this.#subscribe();
    this.renderer.draw(0);
  }

  /** Подгоняет канвас под контейнер; вызывается при изменении размеров окна и клавиатуры. */
  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    const W = Math.floor(box.width);
    const H = Math.floor(box.height);
    if (!W || !H) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (W === this.renderer.W && H === this.renderer.H && dpr === this.renderer.dpr) return;
    this.renderer.resize(W, H, dpr);
    if (this.engine) {
      this.engine.setMetrics({ measure: this.renderer.measure, wordHeight: this.renderer.wordH });
      this.engine.resize(W, H);
      if (this.engine.status !== 'running') this.renderer.draw(0);
    }
  }

  #subscribe() {
    const fx = this.effects;
    const r = this.renderer;
    const c = r.theme;
    const e = this.engine;
    this.unsubs = [
      bus.on('shoot', (p) => {
        r.recoil = 1;
        r.aim = p.angle;
      }),
      bus.on('hit', (p) => {
        fx.burst(p.x, p.y, c.fg, 14, 240);
        fx.ring(p.x, p.y, c.muted, 30 + p.w * 0.16);
        fx.shake(2);
      }),
      bus.on('kill', (p) => fx.text(p.x, p.y - 20, `+${p.points}`, p.multiplier > 1 ? c.fg : c.muted, 15 + Math.min(6, p.multiplier))),
      bus.on('combo', (p) => fx.text(e.width / 2, e.height * 0.32, t('game.combo', { mult: p.multiplier }), c.fg, 24)),
      bus.on('miss', (p) => {
        fx.burst(p.x, p.y, c.muted, 18, 220);
        fx.shake(6);
        fx.flashScreen(c.fg);
      }),
      bus.on('error', () => fx.shake(1.2)),
      bus.on('purge', (p) => fx.burst(p.x, p.y, c.muted, 10, 180)),
      bus.on('revive', () => fx.text(e.width / 2, e.height * 0.4, t('game.revive'), c.fg, 24)),
      bus.on('level', (p) => {
        if (p.up && p.level > 1) fx.text(e.width / 2, e.height * 0.22, `${t('hud.level')} ${p.level}`, c.fg, 22);
      }),
    ];
  }

  start() {
    this.engine.start();
    this.#run();
  }

  pause() {
    this.engine.pause();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  resume() {
    this.engine.resume();
    this.#run();
  }

  #run() {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  frame(now) {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.engine.update(dt);
    this.effects.update(dt);
    this.renderer.draw(dt);
    if (this.onHud && now - this.hudAt > 100) {
      this.hudAt = now;
      this.onHud(this.engine.snapshot());
    }
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.unsubs.forEach((off) => off());
    this.unsubs = [];
    this.provider?.destroy();
    this.engine = null;
  }
}
