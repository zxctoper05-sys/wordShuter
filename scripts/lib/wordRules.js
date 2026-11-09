// Правила отбора слов и расчёта сложности. Используется импортёром; легко расширяется
// для нового языка — добавьте запись в LANG_RULES.

export const LANG_RULES = {
  en: {
    alphabet: /^[a-z]+$/,
    vowels: /[aeiouy]/,
    tiers: [4, 6, 8, 10], // верхние границы длины для сложности 1..4 (дальше — 5)
    rare: new Set('jqxz'),
  },
  ru: {
    alphabet: /^[а-яё]+$/,
    vowels: /[аеёиоуыэюя]/,
    tiers: [5, 7, 9, 11],
    rare: new Set('жфцчщъыэюё'),
  },
};

export const normalizeWord = (raw) => raw.trim().toLowerCase();

export function isValidWord(word, lang, { minLength = 3, maxLength = 14 } = {}) {
  const rules = LANG_RULES[lang];
  if (!rules) return false;
  if (word.length < minLength || word.length > maxLength) return false;
  if (!rules.alphabet.test(word) || !rules.vowels.test(word)) return false;
  if (/(.)\1\1/.test(word)) return false; // «ааа», «ммм» — не слова
  if (lang === 'ru' && /^[ъьы]/.test(word)) return false;
  return true;
}

/** Сложность 1..5: по длине слова, +1 за две и более «редких» буквы. */
export function computeDifficulty(word, lang) {
  const { tiers, rare } = LANG_RULES[lang];
  let d = tiers.findIndex((max) => word.length <= max) + 1;
  if (d === 0) d = 5;
  let rareCount = 0;
  for (const ch of word) if (rare.has(ch)) rareCount++;
  if (rareCount >= 2) d++;
  return Math.min(5, d);
}
