// Обнаружение столкновений: пуля (отрезок движения за кадр) против прямоугольника слова.
// Пуля быстрая, поэтому проверяется отрезок целиком, а не только конечная точка.

/** Слово хранится как центр по X и базовая линия по Y: прямоугольник растёт вверх от y. */
export const wordRect = (w) => ({ x: w.x - w.w / 2, y: w.y - w.h, w: w.w, h: w.h });

export const rectsOverlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const P = [0, 0, 0, 0];
const Q = [0, 0, 0, 0];

/** Алгоритм Лианга — Барски: пересекает ли отрезок (x0,y0)-(x1,y1) прямоугольник r. */
export function segmentHitsRect(x0, y0, x1, y1, r) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  P[0] = -dx; P[1] = dx; P[2] = -dy; P[3] = dy;
  Q[0] = x0 - r.x; Q[1] = r.x + r.w - x0; Q[2] = y0 - r.y; Q[3] = r.y + r.h - y0;
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (P[i] === 0) {
      if (Q[i] < 0) return false;
    } else {
      const t = Q[i] / P[i];
      if (P[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}
