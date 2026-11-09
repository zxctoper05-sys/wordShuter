// Источники словарей. Чтобы добавить язык:
//   1) добавьте запись сюда (main — полный словарь, common — частотный список);
//   2) добавьте правила в scripts/lib/wordRules.js (алфавит, гласные, границы длины);
//   3) добавьте раскладку в public/js/game/layouts.js и переводы в public/js/locales.
// Любой одиночный файл со словами можно импортировать и без правки конфига:
//   npm run dict:import -- --lang=en --file=./my-words.txt --common

const GH = 'https://raw.githubusercontent.com';

export const SOURCES = {
  en: {
    label: 'English',
    main: [
      {
        file: 'en-words_alpha.txt',
        source: 'dwyl/english-words',
        urls: [`${GH}/dwyl/english-words/master/words_alpha.txt`],
        encoding: 'utf-8',
      },
    ],
    common: [
      {
        file: 'en-common.txt',
        source: 'google-10000-english',
        urls: [
          `${GH}/first20hours/google-10000-english/master/google-10000-english-no-swears.txt`,
          `${GH}/first20hours/google-10000-english/master/google-10000-english.txt`,
        ],
        encoding: 'utf-8',
        limit: 10000,
      },
    ],
    blocklist: {
      file: 'en-blocklist.txt',
      urls: [`${GH}/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/en`],
    },
  },
  ru: {
    label: 'Русский',
    main: [
      {
        file: 'ru-russian.txt',
        source: 'danakt/russian-words',
        urls: [
          `${GH}/danakt/russian-words/master/russian.txt`,
          'https://github.com/danakt/russian-words/raw/master/russian.txt',
        ],
        encoding: 'windows-1251', // исходный файл в cp1251, при загрузке конвертируется в UTF-8
      },
    ],
    common: [
      {
        file: 'ru-common.txt',
        source: 'hingston/russian',
        urls: [`${GH}/hingston/russian/master/50000-russian-words-cyrillic-only.txt`],
        encoding: 'utf-8',
        limit: 30000,
      },
    ],
    blocklist: {
      file: 'ru-blocklist.txt',
      urls: [`${GH}/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/ru`],
    },
  },
};
