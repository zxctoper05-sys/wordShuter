// Экран игры: HUD, поле ввода (автофокус), экранная клавиатура, пауза, обратный отсчёт.
import { bus } from '../core/bus.js';
import { fmt, t } from '../core/i18n.js';
import { formatDuration } from '../core/stats.js';
import { settings } from '../core/storage.js';
import { GameSession } from '../game/session.js';
import { $ } from './dom.js';
import { VirtualKeyboard } from './keyboard.js';
import { router } from './router.js';

export function createGameScreen({ onGameOver }) {
  const root = $('#screen-game');
  const canvas = $('#canvas');
  const field = $('#field');
  const typed = $('#typed');
  const hud = {
    score: $('#hud-score'), lives: $('#hud-lives'), combo: $('#hud-combo'), words: $('#hud-words'),
    level: $('#hud-level'), wpm: $('#hud-wpm'), acc: $('#hud-acc'), time: $('#hud-time'),
    timeLabel: $('#hud-time-label'), timeCell: $('#hud-time-cell'),
  };
  const overlays = {
    loading: $('#overlay-loading'), count: $('#overlay-count'), error: $('#overlay-error'), pause: $('#overlay-pause'),
  };

  let session = null;
  let cfg = null;
  let state = 'idle'; // idle | loading | countdown | playing | paused | over
  let token = 0;
  let countdownTimer = 0;
  const shown = {};

  // ───────── HUD ─────────
  function setText(key, node, value) {
    if (shown[key] === value) return;
    shown[key] = value;
    node.textContent = value;
  }

  function renderHud(s) {
    setText('score', hud.score, fmt(s.score));
    setText('lives', hud.lives, '■'.repeat(Math.max(0, s.lives)) + '□'.repeat(Math.max(0, s.maxLives - s.lives)));
    setText('combo', hud.combo, s.combo > 0 ? `${s.combo} ×${s.multiplier}` : '0');
    setText('words', hud.words, fmt(s.destroyed));
    setText('level', hud.level, String(s.level));
    setText('wpm', hud.wpm, String(s.wpm));
    setText('acc', hud.acc, `${s.accuracy}%`);
    const timeMs = (s.timeLeft ?? s.elapsed) * 1000;
    setText('time', hud.time, formatDuration(s.timeLeft != null ? Math.ceil(timeMs / 1000) * 1000 : timeMs));
    hud.timeCell.classList.toggle('warn', s.timeLeft != null && s.timeLeft <= 10);
  }

  function resetHud() {
    for (const k of Object.keys(shown)) delete shown[k];
    typed.value = '';
    syncTimeLabel();
  }

  function syncTimeLabel() {
    hud.timeLabel.textContent = t(cfg?.mode === 'timeattack' ? 'hud.timeLeft' : 'hud.time');
  }

  // ───────── оверлеи ─────────
  function showOverlay(name) {
    for (const [key, node] of Object.entries(overlays)) node.classList.toggle('on', key === name);
  }

  // ───────── ввод ─────────
  const vkb = new VirtualKeyboard($('#vkb'), {
    onChar: (ch) => press(ch),
    onBackspace: () => backspace(),
  });

  const useVirtualKeyboard = () => {
    const mode = settings.get('keyboard');
    return mode === 'on' || (mode === 'auto' && matchMedia('(pointer: coarse)').matches);
  };

  function setupInput(lang) {
    const virtual = useVirtualKeyboard();
    vkb.setLang(lang);
    vkb.setVisible(virtual);
    typed.inputMode = virtual ? 'none' : 'text'; // на экранной клавиатуре системная не появляется
    typed.lang = lang;
    root.classList.toggle('has-vkb', virtual);
  }

  function flashError() {
    typed.classList.remove('err');
    void typed.offsetWidth; // перезапуск CSS-анимации
    typed.classList.add('err');
  }

  function applyResult(result) {
    typed.value = result.value;
    if (!result.accepted) flashError();
  }

  function press(ch) {
    if (state !== 'playing') return;
    const e = session.engine;
    applyResult(e.type(e.input + ch));
  }

  function backspace() {
    if (state !== 'playing') return;
    const e = session.engine;
    applyResult(e.type(e.input.slice(0, -1)));
  }

  function focusInput() {
    if (state === 'playing' || state === 'loading' || state === 'countdown') typed.focus({ preventScroll: true });
  }

  typed.addEventListener('input', () => {
    if (state !== 'playing') {
      typed.value = '';
      return;
    }
    applyResult(session.engine.type(typed.value));
  });
  typed.addEventListener('blur', () => {
    if (state === 'playing') setTimeout(focusInput, 0); // игра идёт — ввод всегда в фокусе
  });
  typed.addEventListener('animationend', () => typed.classList.remove('err'));
  field.addEventListener('pointerdown', () => focusInput());
  bus.on('inputreset', () => { typed.value = ''; });

  document.addEventListener('keydown', (e) => {
    if (!root.classList.contains('active')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (state === 'playing') pause();
      else if (state === 'paused') resume();
      return;
    }
    if (state === 'playing' && e.target !== typed && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      typed.focus({ preventScroll: true }); // первая буква не теряется, даже если фокус сбился
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing') pause();
  });

  new ResizeObserver(() => session?.resize()).observe(field);

  // ───────── жизненный цикл ─────────
  function stop() {
    token++;
    clearTimeout(countdownTimer);
    session?.destroy();
    session = null;
    state = 'idle';
    typed.value = '';
    typed.blur();
    showOverlay(null);
  }

  function countdown(myToken) {
    return new Promise((resolve) => {
      const num = $('#count-num');
      let n = 3;
      showOverlay('count');
      const tick = () => {
        if (myToken !== token) return resolve(false);
        if (n > 0) {
          num.textContent = String(n--);
          num.classList.remove('pop');
          void num.offsetWidth;
          num.classList.add('pop');
          countdownTimer = setTimeout(tick, 650);
        } else {
          num.textContent = t('game.go');
          num.classList.remove('pop');
          void num.offsetWidth;
          num.classList.add('pop');
          countdownTimer = setTimeout(() => {
            showOverlay(null);
            resolve(myToken === token);
          }, 450);
        }
      };
      tick();
    });
  }

  function showError(err) {
    state = 'idle';
    $('#error-text').textContent = t(err?.code === 'empty' ? 'game.errorEmpty' : 'game.errorNetwork');
    showOverlay('error');
    $('#btn-error-retry').focus();
  }

  async function start() {
    stop();
    const myToken = ++token;
    cfg = {
      mode: settings.get('mode'),
      lang: settings.get('gameLang'),
      commonOnly: settings.get('commonOnly'),
      effects: settings.get('effects'),
      shake: settings.get('shake'),
    };
    // Всё ниже до первого await выполняется синхронно в обработчике клика — так iOS даёт фокус полю ввода.
    router.show('game');
    state = 'loading';
    resetHud();
    setupInput(cfg.lang);
    showOverlay('loading');
    focusInput();

    await new Promise((r) => requestAnimationFrame(() => r()));
    if (myToken !== token) return;

    const s = new GameSession(canvas);
    session = s;
    try {
      await s.init(cfg);
    } catch (err) {
      s.destroy();
      if (myToken !== token) return;
      session = null;
      showError(err);
      return;
    }
    if (myToken !== token) {
      s.destroy();
      return;
    }

    s.onHud = renderHud;
    renderHud(s.engine.snapshot());
    state = 'countdown';
    const go = await countdown(myToken);
    if (!go || myToken !== token) return;

    state = 'playing';
    s.start();
    focusInput();
  }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    session.pause();
    typed.blur();
    showOverlay('pause');
    $('#btn-resume').focus();
  }

  function resume() {
    if (state !== 'paused') return;
    state = 'playing';
    showOverlay(null);
    session.resume();
    focusInput();
  }

  bus.on('gameover', ({ summary }) => {
    if (state !== 'playing' && state !== 'paused') return;
    const myToken = token;
    state = 'over';
    showOverlay(null);
    typed.blur();
    setTimeout(() => { // даём доиграть эффектам последнего попадания
      if (myToken !== token || state !== 'over') return;
      stop();
      onGameOver(summary);
    }, 550);
  });

  bus.on('langchange', () => {
    syncTimeLabel();
    if (state === 'playing' || state === 'paused') renderHud(session.engine.snapshot());
  });

  $('#btn-pause').addEventListener('click', pause);
  $('#btn-resume').addEventListener('click', resume);
  $('#btn-restart').addEventListener('click', start);
  $('#btn-finish').addEventListener('click', () => session?.engine.finish('manual'));
  $('#btn-quit').addEventListener('click', () => { stop(); router.show('menu'); });
  $('#btn-error-retry').addEventListener('click', start);
  $('#btn-error-menu').addEventListener('click', () => { stop(); router.show('menu'); });

  return { start, stop };
}
