// Экран статистики: общие показатели, личные рекорды по режимам/языкам и последние игры.
import { bus } from '../core/bus.js';
import { fmt, getLang, t } from '../core/i18n.js';
import { formatDuration, formatPlayTime, stats } from '../core/stats.js';
import { $, el } from './dom.js';

export function createStatsScreen() {
  const body = $('#stats-body');
  let data = null;
  let status = 'idle'; // idle | loading | error | ready

  const card = (label, value) => el('div', { class: 'cell' }, el('dt', { text: label }), el('dd', { text: value }));
  const table = (head, rows) =>
    el('div', { class: 'table-wrap' },
      el('table', {},
        el('thead', {}, el('tr', {}, head.map((h) => el('th', { scope: 'col', text: h })))),
        el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c) => el('td', { text: c })))))));

  function render() {
    if (status === 'loading' && !data) return body.replaceChildren(el('p', { class: 'hint', text: t('stats.loading') }));
    if (status === 'error' && !data) return body.replaceChildren(el('p', { class: 'hint', text: t('stats.loadFailed') }));
    if (!data) return body.replaceChildren();
    if (data.totals.games === 0) return body.replaceChildren(el('p', { class: 'empty', text: t('stats.empty') }));

    const tt = data.totals;
    const locale = getLang() === 'ru' ? 'ru-RU' : 'en-GB';
    const date = (iso) => new Date(iso).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

    body.replaceChildren(
      el('dl', { class: 'stat-grid' },
        card(t('stats.games'), fmt(tt.games)),
        card(t('stats.words'), fmt(tt.words)),
        card(t('stats.time'), formatPlayTime(tt.durationMs, { h: t('unit.h'), min: t('unit.min'), sec: t('unit.sec') })),
        card(t('stats.accuracy'), `${tt.accuracy.toFixed(1)}%`),
        card(t('stats.bestWpm'), tt.bestWpm.toFixed(1)),
        card(t('stats.bestCombo'), fmt(tt.bestCombo))),
      el('h2', { text: t('stats.records') }),
      table(
        [t('stats.col.mode'), t('stats.col.lang'), t('stats.col.score'), t('stats.col.wpm'), t('stats.col.combo'), t('stats.col.games')],
        data.records.map((r) => [t(`mode.${r.mode}`), t(`lang.${r.lang}`), fmt(r.bestScore), r.bestWpm.toFixed(1), fmt(r.bestCombo), fmt(r.games)]),
      ),
      el('h2', { text: t('stats.recent') }),
      table(
        [t('stats.col.date'), t('stats.col.mode'), t('stats.col.lang'), t('stats.col.score'), t('stats.col.wpm'), t('stats.col.accuracy')],
        data.recent.map((g) => [date(g.createdAt), t(`mode.${g.mode}`), t(`lang.${g.lang}`), fmt(g.score), g.maxWpm.toFixed(1), `${g.accuracy.toFixed(0)}%`]),
      ),
    );
  }

  async function load() {
    status = 'loading';
    render();
    try {
      data = await stats.fetch();
      status = 'ready';
    } catch {
      status = 'error';
    }
    render();
  }

  bus.on('screen', (name) => { if (name === 'stats') load(); });
  bus.on('langchange', render);
}
