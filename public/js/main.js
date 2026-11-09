// Точка входа: локализация, настройки, экраны, подгонка под область просмотра на мобильных.
import { setLang } from './core/i18n.js';
import { stats } from './core/stats.js';
import { settings } from './core/storage.js';
import { bindControls } from './ui/controls.js';
import { createGameScreen } from './ui/gameScreen.js';
import { createMenuScreen } from './ui/menuScreen.js';
import { createResultsScreen } from './ui/resultsScreen.js';
import { router } from './ui/router.js';
import { createStatsScreen } from './ui/statsScreen.js';

// Высота приложения = видимая область: экранная клавиатура ОС не перекрывает игровое поле.
function syncViewport() {
  const vv = window.visualViewport;
  const root = document.documentElement.style;
  root.setProperty('--app-h', `${Math.round(vv ? vv.height : window.innerHeight)}px`);
  root.setProperty('--app-top', `${Math.round(vv ? vv.offsetTop : 0)}px`);
}

function boot() {
  syncViewport();
  window.addEventListener('resize', syncViewport);
  window.addEventListener('orientationchange', syncViewport);
  window.visualViewport?.addEventListener('resize', syncViewport);
  window.visualViewport?.addEventListener('scroll', syncViewport);

  setLang(settings.get('uiLang'));
  settings.onChange((state, changed) => {
    if (changed.includes('uiLang')) setLang(state.uiLang);
  });
  bindControls();

  const game = createGameScreen({ onGameOver: (summary) => results.show(summary) });
  const results = createResultsScreen({ onPlayAgain: () => game.start() });
  createStatsScreen();
  createMenuScreen({ onPlay: () => game.start() });

  router.show('menu');
  stats.flushPending();
}

boot();
