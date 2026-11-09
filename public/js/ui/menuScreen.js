// Главное меню: кнопка «Играть», рекорд выбранного режима, состояние словаря.
import { api } from '../core/api.js';
import { bus } from '../core/bus.js';
import { fmt, t } from '../core/i18n.js';
import { stats } from '../core/stats.js';
import { settings } from '../core/storage.js';
import { $ } from './dom.js';

export function createMenuScreen({ onPlay }) {
  const play = $('#btn-play');
  const record = $('#menu-record');
  const dictInfo = $('#dict-info');
  let dict = null; // null — ещё грузится, false — сервер недоступен, объект — {ru:{total,common}, …}

  function renderDict() {
    const lang = settings.get('gameLang');
    play.disabled = false;
    if (dict === null) {
      dictInfo.textContent = '';
    } else if (dict === false) {
      dictInfo.textContent = t('menu.dictOffline');
    } else {
      const info = dict[lang] ?? { total: 0, common: 0 };
      const count = settings.get('commonOnly') ? info.common : info.total;
      dictInfo.textContent = count ? t('menu.dict', { count: fmt(count) }) : t('menu.dictEmpty');
      play.disabled = count === 0;
    }
  }

  function renderRecord() {
    const rec = stats.last?.records.find((r) => r.mode === settings.get('mode') && r.lang === settings.get('gameLang'));
    record.textContent = rec ? t('menu.record', { score: fmt(rec.bestScore) }) : stats.last ? t('menu.recordNone') : '';
  }

  const loadDict = () => api.getDictionaries().then((d) => { dict = d; }).catch(() => { dict = false; }).finally(renderDict);
  const loadStats = () => stats.fetch().catch(() => {}).finally(renderRecord);

  play.addEventListener('click', () => { if (!play.disabled) onPlay(); });
  settings.onChange(() => { renderDict(); renderRecord(); });
  bus.on('langchange', () => { renderDict(); renderRecord(); });
  bus.on('statschanged', loadStats);
  bus.on('screen', (name) => { if (name === 'menu' && dict === false) loadDict(); });

  loadDict();
  loadStats();
}
