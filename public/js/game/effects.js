// Анимации и эффекты: частицы (пул объектов, без аллокаций в кадре), кольца, всплывающие
// надписи, тряска экрана и красная вспышка при потере жизни.
const TAU = Math.PI * 2;

export class Effects {
  constructor(capacity = 480) {
    this.parts = Array.from({ length: capacity }, () => ({
      on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: '#fff',
    }));
    this.cursor = 0;
    this.rings = [];
    this.texts = [];
    this.shakeAmp = 0;
    this.flash = 0;
    this.flashColor = '#ff5a76';
    this.enabled = true;
    this.shakeEnabled = true;
    this.fontFamily = 'monospace';
    this._off = { x: 0, y: 0 };
  }

  #alloc() {
    const n = this.parts.length;
    for (let i = 0; i < n; i++) {
      const idx = (this.cursor + i) % n;
      if (!this.parts[idx].on) {
        this.cursor = (idx + 1) % n;
        return this.parts[idx];
      }
    }
    const p = this.parts[this.cursor]; // пул заполнен — переиспользуем самую старую позицию
    this.cursor = (this.cursor + 1) % n;
    return p;
  }

  burst(x, y, color, count = 18, speed = 260) {
    if (!this.enabled) return;
    for (let i = 0; i < count; i++) {
      const p = this.#alloc();
      const a = Math.random() * TAU;
      const s = speed * (0.25 + Math.random() * 0.75);
      p.on = true; p.x = x; p.y = y;
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      p.life = p.max = 0.35 + Math.random() * 0.45;
      p.size = 1.5 + Math.random() * 2.5;
      p.color = color;
    }
  }

  ring(x, y, color, radius = 46) {
    if (!this.enabled) return;
    this.rings.push({ x, y, color, r: 6, max: radius, t: 0, life: 0.4 });
  }

  text(x, y, str, color, size = 18) {
    this.texts.push({ x, y, str, color, size, life: 0.9, max: 0.9 });
    if (this.texts.length > 24) this.texts.shift();
  }

  shake(amp) {
    if (this.shakeEnabled) this.shakeAmp = Math.max(this.shakeAmp, amp);
  }

  flashScreen(color) {
    if (!this.enabled) return;
    this.flash = 0.35;
    this.flashColor = color;
  }

  update(dt) {
    const drag = Math.exp(-3 * dt);
    for (const p of this.parts) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      p.vx *= drag;
      p.vy = p.vy * drag + 220 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      r.r = 6 + (r.max - 6) * Math.min(1, r.t / r.life);
      if (r.t >= r.life) this.rings.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const tx = this.texts[i];
      tx.life -= dt;
      tx.y -= 36 * dt;
      if (tx.life <= 0) this.texts.splice(i, 1);
    }
    this.shakeAmp = Math.max(0, this.shakeAmp - dt * 28);
    this.flash = Math.max(0, this.flash - dt * 1.4);
  }

  shakeOffset() {
    const a = this.shakeAmp;
    this._off.x = a ? (Math.random() - 0.5) * 2 * a : 0;
    this._off.y = a ? (Math.random() - 0.5) * 2 * a : 0;
    return this._off;
  }

  draw(ctx, W, H) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      if (!p.on) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.lineWidth = 2;
    for (const r of this.rings) {
      ctx.globalAlpha = 1 - r.t / r.life;
      ctx.strokeStyle = r.color;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const tx of this.texts) {
      ctx.globalAlpha = Math.min(1, (tx.life / tx.max) * 1.6);
      ctx.fillStyle = tx.color;
      ctx.font = `700 ${tx.size}px ${this.fontFamily}`;
      ctx.fillText(tx.str, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;

    if (this.flash > 0) {
      ctx.globalAlpha = this.flash * 0.35;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(-20, -20, W + 40, H + 40);
      ctx.globalAlpha = 1;
    }
  }
}
