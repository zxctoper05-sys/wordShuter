// Универсальная привязка элементов к настройкам и навигации через data-атрибуты:
//   <div data-setting="mode"><button data-value="classic">…</button></div>
//   <button data-nav="stats">…</button>
import { settings } from '../core/storage.js';
import { $$ } from './dom.js';
import { router } from './router.js';

const parseValue = (v) => (v === 'true' ? true : v === 'false' ? false : v);

export function bindControls() {
  for (const group of $$('[data-setting]')) {
    const key = group.dataset.setting;
    const sync = () => {
      for (const btn of $$('[data-value]', group)) {
        btn.setAttribute('aria-pressed', String(String(settings.get(key)) === btn.dataset.value));
      }
    };
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-value]');
      if (btn && group.contains(btn)) settings.set({ [key]: parseValue(btn.dataset.value) });
    });
    settings.onChange(sync);
    sync();
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-nav]');
    if (btn) router.show(btn.dataset.nav);
  });
}
