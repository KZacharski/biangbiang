import type { Messages } from './types';

/**
 * Russian selects between three plural forms: the singular for 1 and 21, 31, …
 * the "few" form for 2-4 (but not 12-14), and the "many" form for the rest.
 */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Russian (ru-RU). */
export const ru_ru: Messages = {
  appTitleFallback: 'Зеркало релизов',

  loading: 'Загрузка…',
  refresh: 'Проверить обновления',
  refreshing: 'Проверка…',
  refreshed: 'Проверка завершена',
  refreshFailed: 'Не удалось проверить',

  loadErrorTitle: 'Не удалось загрузить данные',
  loadErrorSubtitle: 'Проверьте подключение к сети и повторите попытку.',
  retry: 'Повторить',

  noProjects: 'В конфигурации пока нет проектов',
  noRelease: 'Релизов пока нет',
  noAssets: 'В этом релизе нет файлов для скачивания',
  syncError: 'Ошибка синхронизации',

  versionLabel: 'Версия',
  viewRepo: 'Открыть репозиторий',
  openRelease: 'Открыть страницу релиза',
  download: 'Скачать',
  releasedAt: 'Опубликовано',

  updatedAt: 'Обновлено',
  never: 'Ещё не обновлялось',
  lastChecked: 'Последняя проверка',
  checkIntervalHint: 'Проверка обновлений каждые 24 часа',
  poweredBy: (version) => `Работает на biangbiang ${version}`,

  sortLabel: 'Сортировка',
  sortByName: 'По названию',
  sortByUpdated: 'По обновлению',
  sortByMostAssets: 'Больше файлов',
  sortByLeastAssets: 'Меньше файлов',

  themeLabel: 'Тема',
  themeAuto: 'Как в системе',
  themeLight: 'Светлая',
  themeDark: 'Тёмная',

  projectsCount: (n) => `${n} ${plural(n, 'проект', 'проекта', 'проектов')}`,
};
