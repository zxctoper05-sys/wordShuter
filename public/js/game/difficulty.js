// Режимы игры и менеджер сложности. Скорость задаётся долей высоты поля в секунду,
// поэтому игра одинаково проходится на любом размере экрана.

export const MODES = {
  classic: { id: 'classic', lives: 5, timeLimit: null, progress: 'words', perLevel: 12, maxLevel: 10, victory: true, revive: false },
  survival: { id: 'survival', lives: 3, timeLimit: null, progress: 'time', perLevel: 20, maxLevel: Infinity, victory: false, revive: false },
  timeattack: { id: 'timeattack', lives: 5, timeLimit: 90, progress: 'time', perLevel: 15, maxLevel: Infinity, victory: false, revive: false },
  endless: { id: 'endless', lives: 3, timeLimit: null, progress: 'words', perLevel: 15, maxLevel: Infinity, victory: false, revive: true },
};

export const MODE_IDS = Object.keys(MODES);
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Множитель очков за комбо: ×1 … ×8, +1 за каждые 5 слов подряд. */
export const multiplierFor = (combo) => Math.min(8, 1 + Math.floor(combo / 5));

/** Выбор тира сложности слова (1..5) вокруг среднего значения с небольшим разбросом. */
export function pickTier(mean, rng = Math.random) {
  const noise = (rng() + rng() + rng() - 1.5) * 0.9;
  return clamp(Math.round(mean + noise), 1, 5);
}

export class DifficultyManager {
  constructor(mode) {
    this.mode = mode;
    this.level = 1;
    this.baseLevel = 1;
    this.penalty = 0;
  }

  /** Пересчитывает уровень по прогрессу игры. */
  update({ elapsed, destroyed }) {
    const m = this.mode;
    const raw = m.progress === 'words' ? destroyed / m.perLevel : elapsed / m.perLevel;
    this.baseLevel = Math.min(m.maxLevel, 1 + Math.floor(raw));
    const next = Math.max(1, this.baseLevel - this.penalty);
    const prev = this.level;
    this.level = next;
    return { changed: next !== prev, up: next > prev };
  }

  /** Эндлесс: после потери всех жизней сложность откатывается. */
  dropLevels(n = 2) {
    this.penalty = Math.min(this.penalty + n, Math.max(0, this.baseLevel - 1));
    this.level = Math.max(1, this.baseLevel - this.penalty);
  }

  params() {
    const L = Math.min(this.level, 30);
    return {
      level: this.level,
      fall: Math.min(0.34, 0.06 + 0.016 * (L - 1)),     // доля высоты до земли в секунду
      spawn: Math.max(0.75, 2.4 - 0.13 * (L - 1)),       // секунд между словами
      maxActive: Math.min(9, 3 + Math.floor(L / 2)),     // слов на экране одновременно
      tierMean: 1 + (L - 1) * 0.4,                       // средняя сложность слов
    };
  }
}
