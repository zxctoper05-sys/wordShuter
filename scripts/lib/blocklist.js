// Фильтр неподходящих слов: базовые шаблоны + (если скачан) открытый список LDNOOBW.
import fs from 'node:fs';

const PATTERNS = {
  en: [
    /fuck/, /shit/, /cunt/, /bitch/, /whore/, /slut/, /nigg/, /fagg/, /porn/, /nazi/, /retard/,
    /^rap(e|ed|es|ing|ist|ists)$/,
    /^(cock|dick|penis|vagina|pussy|anus|tit|tits|boob|boobs)s?$/,
  ],
  ru: [
    /ху[йеёяи]/, /пизд/, /пезд/, /ебан/, /ебат/, /ебал/, /ебну/, /ебуч/, /^[её]б/, /блят/, /бляд/,
    /залуп/, /муд[аоие]/, /шлюх/, /говн/, /дерьм/, /жоп/, /пидор/, /пидар/, /гондон/, /дроч/, /мраз/,
  ],
};

export function loadBlockFilter(lang, file) {
  const exact = new Set();
  if (file && fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const w = line.trim().toLowerCase();
      if (w && !/\s/.test(w)) exact.add(w);
    }
  }
  const patterns = PATTERNS[lang] ?? [];
  const filter = (word) => exact.has(word) || patterns.some((re) => re.test(word));
  filter.listSize = exact.size;
  return filter;
}
