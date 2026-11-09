// Отрисовка на Canvas: фон-звёзды, слова, пули, пушка. Размеры считаются в CSS-пикселях,
// физическое разрешение учитывает devicePixelRatio (не выше 2 — ради стабильных 60 FPS).
import { clamp } from './difficulty.js';

const TAU = Math.PI * 2;

function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, d) => cs.getPropertyValue(name).trim() || d;
  return {
    bg: v('--bg', '#070a16'), panel: v('--panel', '#0e1428'), panel2: v('--panel-2', '#141c36'),
    line: v('--line', '#25315a'), text: v('--text', '#e8edff'), muted: v('--muted', '#8d99c2'),
    cyan: v('--cyan', '#3de6ff'), magenta: v('--magenta', '#ff4fa3'), danger: v('--danger', '#ff5a76'),
    warn: v('--warn', '#ffd166'), mono: v('--mono', 'monospace'),
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) return ctx.roundRect(x, y, w, h, r);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class Renderer {
  constructor(canvas, effects) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.fx = effects;
    this.engine = null;
    this.theme = readTheme();
    effects.fontFamily = this.theme.mono;
    this.W = 0;
    this.H = 0;
    this.dpr = 1;
    this.fontPx = 20;
    this.padX = 9;
    this.wordH = 32;
    this.font = `600 20px ${this.theme.mono}`;
    this.aim = 0;
    this.recoil = 0;
    this.stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7 }));
    this.measure = this.measure.bind(this);
  }

  attach(engine) {
    this.engine = engine;
  }

  resize(W, H, dpr) {
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.fontPx = clamp(Math.round(Math.min(W / 30, H / 11)), 14, 26);
    this.padX = Math.round(this.fontPx * 0.45);
    this.wordH = Math.round(this.fontPx * 1.6);
    this.font = `600 ${this.fontPx}px ${this.theme.mono}`;
  }

  measure(text) {
    this.ctx.font = this.font;
    return Math.ceil(this.ctx.measureText(text).width) + this.padX * 2;
  }

  /** Сколько букв гарантированно помещается в ширину поля — ограничивает длину слов из API. */
  maxWordChars() {
    return clamp(Math.floor((this.W - 24 - this.padX * 2) / (this.fontPx * 0.62)), 6, 16);
  }

  draw(dt) {
    const e = this.engine;
    if (!e || !this.W) return;
    const { ctx, W, H, theme: c } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, W, H);

    const off = this.fx.shakeOffset();
    ctx.save();
    ctx.translate(off.x, off.y);
    this.#stars(dt);
    this.#ground(e);
    this.#words(e);
    this.#bullets(e);
    this.#cannon(e, dt);
    this.fx.draw(ctx, W, H);
    ctx.restore();
  }

  #stars(dt) {
    const { ctx, W, H } = this;
    ctx.fillStyle = this.theme.muted;
    for (const s of this.stars) {
      s.y += dt * 0.012 * s.z;
      if (s.y > 1) { s.y -= 1; s.x = Math.random(); }
      ctx.globalAlpha = 0.18 + s.z * 0.4;
      const size = s.z > 0.8 ? 2 : 1;
      ctx.fillRect(s.x * W, s.y * H, size, size);
    }
    ctx.globalAlpha = 1;
  }

  #ground(e) {
    const { ctx, W, theme: c } = this;
    let near = 0;
    for (const w of e.words) if (!w.doomed) near = Math.max(near, w.y / e.groundY);
    const hot = near > 0.78 ? (near - 0.78) / 0.22 : 0;
    ctx.strokeStyle = hot > 0 ? c.danger : c.line;
    ctx.globalAlpha = 0.6 + hot * 0.4;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(0, e.groundY);
    ctx.lineTo(W, e.groundY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  #words(e) {
    const { ctx, theme: c } = this;
    ctx.font = this.font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const typed = e.input.length;
    for (const w of e.words) {
      const x0 = w.x - w.w / 2;
      const y0 = w.y - w.h;
      const danger = w.y / e.groundY > 0.78;
      const isTarget = w === e.target;
      ctx.globalAlpha = w.doomed ? 0.4 : 1;

      ctx.fillStyle = c.panel;
      roundRect(ctx, x0, y0, w.w, w.h, 6);
      ctx.fill();
      ctx.lineWidth = isTarget ? 2 : 1;
      ctx.strokeStyle = isTarget ? c.cyan : danger ? c.danger : c.line;
      ctx.stroke();
      if (isTarget) {
        ctx.save();
        ctx.shadowColor = c.cyan;
        ctx.shadowBlur = 14;
        ctx.stroke();
        ctx.restore();
      }

      const ty = y0 + w.h / 2 + 1;
      if (isTarget && typed) {
        const head = w.text.slice(0, typed);
        const hw = ctx.measureText(head).width;
        ctx.fillStyle = c.cyan;
        ctx.fillText(head, x0 + this.padX, ty);
        ctx.fillStyle = c.text;
        ctx.fillText(w.text.slice(typed), x0 + this.padX + hw, ty);
      } else {
        ctx.fillStyle = danger ? c.danger : c.text;
        ctx.fillText(w.text, x0 + this.padX, ty);
      }
    }
    ctx.globalAlpha = 1;
  }

  #bullets(e) {
    const { ctx, theme: c } = this;
    ctx.lineCap = 'round';
    for (const b of e.bullets) {
      ctx.strokeStyle = c.cyan;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(b.x - b.dx * 28, b.y - b.dy * 28);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.shadowColor = c.cyan;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3.2, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  #cannon(e, dt) {
    const { ctx, theme: c } = this;
    const px = e.pivotX;
    const py = e.pivotY;
    const s = e.zone / 64;

    let want = 0;
    if (e.target) want = clamp(Math.atan2(e.target.x - px, py - (e.target.y - e.target.h / 2)), -1.25, 1.25);
    this.aim += (want - this.aim) * Math.min(1, dt * 16);
    this.recoil = Math.max(0, this.recoil - dt * 7);

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = c.cyan;
    ctx.fillStyle = c.panel;
    ctx.beginPath();
    ctx.moveTo(px - 32 * s, e.height + 2);
    ctx.lineTo(px - 18 * s, py + 6 * s);
    ctx.lineTo(px + 18 * s, py + 6 * s);
    ctx.lineTo(px + 32 * s, e.height + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(this.aim);
    const len = e.barrel - this.recoil * 6 * s;
    ctx.fillStyle = c.panel2;
    ctx.beginPath();
    ctx.rect(-4.5 * s, -len, 9 * s, len);
    ctx.fill();
    ctx.stroke();
    if (this.recoil > 0.55) {
      ctx.fillStyle = '#fff';
      ctx.shadowColor = c.cyan;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(0, -e.barrel - 2 * s, 5 * s * this.recoil, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = c.panel2;
    ctx.beginPath();
    ctx.arc(px, py, 11 * s, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = c.cyan;
    ctx.beginPath();
    ctx.arc(px, py, 3.5 * s, 0, TAU);
    ctx.fill();
  }
}
