// Локализация интерфейса. Язык переключается на лету, без перезагрузки; тексты берутся
// из locales/*.js. Чтобы добавить язык интерфейса — создайте файл локали и добавьте его в DICTS.
import { bus } from './bus.js';
import en from '../locales/en.js';
import ru from '../locales/ru.js';

const DICTS = { ru, en };
let lang = 'ru';
let numberFormat = new Intl.NumberFormat('ru');

export const getLang = () => lang;

export function t(key, vars) {
  let s = DICTS[lang][key] ?? DICTS.ru[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
  return s;
}

export const fmt = (n) => numberFormat.format(n);

export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  });
}

export function setLang(next) {
  if (!DICTS[next]) return;
  lang = next;
  numberFormat = new Intl.NumberFormat(next === 'ru' ? 'ru' : 'en');
  document.documentElement.lang = next;
  document.title = t('app.title');
  applyTranslations(document);
  bus.emit('langchange', next);
}
