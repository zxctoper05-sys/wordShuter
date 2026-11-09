// Экранная клавиатура для сенсорных устройств: раскладка зависит от языка слов.
// Нажатия обрабатываются по pointerdown (без задержки click) и не отбирают фокус у поля ввода.
import { LAYOUTS } from '../game/layouts.js';
import { el } from './dom.js';

export class VirtualKeyboard {
  constructor(root, { onChar, onBackspace }) {
    this.root = root;
    this.lang = null;
    root.addEventListener('pointerdown', (e) => {
      const key = e.target.closest('button');
      if (!key || !root.contains(key)) return;
      e.preventDefault();
      if (key.dataset.char) onChar(key.dataset.char);
      else onBackspace();
    });
    root.addEventListener('click', (e) => e.preventDefault());
  }

  setLang(lang) {
    if (lang === this.lang) return;
    this.lang = lang;
    const rows = LAYOUTS[lang] ?? LAYOUTS.en;
    this.root.replaceChildren(
      ...rows.map((letters, i) => {
        const keys = [...letters].map((ch) => el('button', { type: 'button', class: 'key', 'data-char': ch, tabindex: '-1', text: ch.toUpperCase() }));
        if (i === rows.length - 1) {
          keys.push(el('button', { type: 'button', class: 'key wide', tabindex: '-1', 'aria-label': 'Backspace', text: '⌫' }));
        }
        return el('div', { class: 'row' }, keys);
      }),
    );
  }

  setVisible(visible) {
    this.root.classList.toggle('on', visible);
  }
}
