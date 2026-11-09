// Экран итогов: статистика забега, уведомление о новых рекордах, сохранение результата.
import { bus } from '../core/bus.js';
import { fmt, t } from '../core/i18n.js';
import { formatDuration, stats } from '../core/stats.js';
import { $, el } from './dom.js';
import { router } from './router.js';

export function createResultsScreen({ onPlayAgain }) {
  const ids = ['score', 'words', 'avg', 'max', 'acc', 'combo', 'time', 'level'];
  const out = Object.fromEntries(ids.map((id) => [id, $(`#res-${id}`)]));
  const title = $('#res-title');
  const recordsBox = $('#res-records');
  const saveLine = $('#res-save');
  let view = null; // { summary, save, records }
  let seq = 0;

  const SAVE_KEYS = { saving: 'result.saving', saved: 'result.saved', queued: 'result.saveQueued', failed: 'result.saveFailed' };

  function render() {
    if (!view) return;
    const s = view.summary;
    title.textContent = t(`result.title.${s.reason}`);
    title.dataset.reason = s.reason;
    out.score.textContent = fmt(s.score);
    out.words.textContent = fmt(s.wordsDestroyed);
    out.avg.textContent = s.avgWpm.toFixed(1);
    out.max.textContent = s.maxWpm.toFixed(1);
    out.acc.textContent = `${s.accuracy.toFixed(1)}%`;
    out.combo.textContent = fmt(s.bestCombo);
    out.time.textContent = formatDuration(s.durationMs);
    out.level.textContent = String(s.level);
    saveLine.textContent = view.save ? t(SAVE_KEYS[view.save]) : '';

    const earned = Object.entries(view.records ?? {}).filter(([, on]) => on).map(([key]) => key);
    recordsBox.hidden = earned.length === 0;
    recordsBox.replaceChildren(
      ...(earned.length
        ? [
            el('p', { class: 'record-title', text: t('result.newRecord') }),
            el('ul', {}, earned.map((key) => el('li', { text: t(`result.record.${key}`) }))),
          ]
        : []),
    );
  }

  async function show(summary) {
    const mine = ++seq;
    const savable = summary.score > 0 || summary.wordsDestroyed > 0;
    view = { summary, save: savable ? 'saving' : null, records: null };
    router.show('results');
    render();
    $('#btn-again').focus();
    if (!savable) return;
    const res = await stats.submit(summary);
    if (mine !== seq) return;
    view.save = res.status;
    view.records = res.records;
    render();
  }

  bus.on('langchange', render);
  $('#btn-again').addEventListener('click', onPlayAgain);
  return { show };
}
