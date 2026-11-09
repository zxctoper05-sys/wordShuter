// Отрисовка на Canvas в чёрно-фиолетовой палитре. Размеры считаются в CSS-пикселях, физическое
// разрешение учитывает devicePixelRatio (не выше 2 — ради стабильных 60 FPS).
// Состояния слов различаются и формой, и цветом: цель — фиолетовая рамка с подсветкой и залитые
// набранные буквы, слово у земли — пунктирная рамка.
import { clamp } from './difficulty.js';

const TAU = Math.PI * 2;

function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, d) => cs.getPropertyValue(name).trim() || d;
  return {
    bg: v('--bg', '#08070c'), panel: v('--panel', '#121118'), panel2: v('--panel-2', '#1a1822'),
    line: v('--line', '#26232f'), lineStrong: v('--line-strong', '#3a3647'),
    text: v('--text', '#ece9f5'), textDim: v('--text-dim', '#b3aec4'), muted: v('--muted', '#857f99'),
    fg: v('--fg', '#fff'), accent: v('--accent', '#7c3aed'), accentHi: v('--accent-hi', '#a78bfa'),
    mono: v('--mono', 'monospace'),
  };
}

function rect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) return ctx.roundRect(x, y, w, h, r);
  ctx.rect(x, y, w, h);
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
    this.font = `500 20px ${this.theme.mono}`;
    this.aim = 0;
    this.recoil = 0;
    this.stars = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7 }));
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
    this.fontPx = clamp(Math.round(Math.min(W / 30, H / 11)), 16, 26);
    this.padX = Math.round(this.fontPx * 0.45);
    this.wordH = Math.round(this.fontPx * 1.6);
    this.font = `500 ${this.fontPx}px ${this.theme.mono}`;
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

  /** Редкие тусклые точки — фон не отвлекает от слов. */
  #stars(dt) {
    const { ctx, W, H } = this;
    ctx.fillStyle = this.theme.accentHi;
    for (const st of this.stars) {
      st.y += dt * 0.01 * st.z;
      if (st.y > 1) { st.y -= 1; st.x = Math.random(); }
      ctx.globalAlpha = 0.08 + st.z * 0.2;
      ctx.fillRect(Math.round(st.x * W), Math.round(st.y * H), st.z > 0.85 ? 2 : 1, st.z > 0.85 ? 2 : 1);
    }
    ctx.globalAlpha = 1;
  }

  #ground(e) {
    const { ctx, W, theme: c } = this;
    let near = 0;
    for (const w of e.words) if (!w.doomed) near = Math.max(near, w.y / e.groundY);
    const hot = near > 0.78;
    const y = Math.round(e.groundY) + 0.5;
    ctx.strokeStyle = hot ? c.accentHi : c.lineStrong;
    ctx.lineWidth = hot ? 1.5 : 1;
    ctx.setLineDash(hot ? [] : [6, 6]);
    if (hot) { ctx.shadowColor = c.accent; ctx.shadowBlur = 10; }
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
  }

  #words(e) {
    const { ctx, theme: c } = this;
    ctx.font = this.font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const typed = e.input.length;
    const textH = Math.round(this.fontPx * 1.25);
    for (const w of e.words) {
      const x0 = Math.round(w.x - w.w / 2);
      const y0 = Math.round(w.y - w.h);
      const danger = w.y / e.groundY > 0.78;
      const isTarget = w === e.target;
      ctx.globalAlpha = w.doomed ? 0.35 : 1;

      ctx.fillStyle = c.panel;
      rect(ctx, x0, y0, w.w, w.h, 2);
      ctx.fill();
      ctx.strokeStyle = isTarget || danger ? c.accentHi : c.lineStrong;
      ctx.lineWidth = isTarget ? 2 : 1;
      ctx.setLineDash(danger && !isTarget ? [4, 3] : []);
      if (isTarget) { ctx.shadowColor = c.accent; ctx.shadowBlur = 12; }
      rect(ctx, x0 + 0.5, y0 + 0.5, w.w - 1, w.h - 1, 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);

      const tx = x0 + this.padX;
      const ty = y0 + w.h / 2 + 1;
      if (isTarget && typed) {
        const head = w.text.slice(0, typed);
        const hw = ctx.measureText(head).width;
        ctx.fillStyle = c.accent; // набранная часть — залитый блок
        ctx.fillRect(tx - 1, ty - textH / 2, hw + 2, textH);
        ctx.fillStyle = c.fg;
        ctx.fillText(head, tx, ty);
        ctx.fillText(w.text.slice(typed), tx + hw, ty);
      } else {
        ctx.fillStyle = isTarget || danger ? c.fg : c.textDim;
        ctx.fillText(w.text, tx, ty);
      }
    }
    ctx.globalAlpha = 1;
  }

  #bullets(e) {
    const { ctx, theme: c } = this;
    ctx.lineCap = 'butt';
    for (const b of e.bullets) {
      ctx.strokeStyle = c.accentHi;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x - b.dx * 26, b.y - b.dy * 26);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = c.fg;
      ctx.shadowColor = c.accent;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.8, 0, TAU);
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
    ctx.lineJoin = 'miter';
    ctx.strokeStyle = c.accentHi;
    ctx.fillStyle = c.bg;
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
    ctx.fillStyle = c.accentHi;
    ctx.fillRect(-3.5 * s, -len, 7 * s, len);
    if (this.recoil > 0.6) {
      ctx.fillStyle = c.fg;
      ctx.fillRect(-7 * s * this.recoil, -e.barrel - 3 * s, 14 * s * this.recoil, 3 * s); // вспышка выстрела
    }
    ctx.restore();

    ctx.fillStyle = c.bg;
    ctx.beginPath();
    ctx.arc(px, py, 10 * s, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = c.fg;
    ctx.beginPath();
    ctx.arc(px, py, 3 * s, 0, TAU);
    ctx.fill();
  }
}
