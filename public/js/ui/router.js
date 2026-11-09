import { bus } from '../core/bus.js';
import { $$ } from './dom.js';

let current = 'menu';

export const router = {
  get current() { return current; },
  show(name) {
    const next = document.getElementById(`screen-${name}`);
    if (!next) return;
    for (const screen of $$('.screen')) screen.classList.toggle('active', screen === next);
    current = name;
    bus.emit('screen', name);
  },
};
