import type { Messages } from './types';

/**
 * Polish selects between three plural forms: the singular for 1, the "few" form
 * for 2-4 (but not 12-14), and the "many" form for everything else.
 */
function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Polish (pl-PL). */
export const pl_pl: Messages = {
  appTitleFallback: 'Lustro wydań',

  loading: 'Wczytywanie…',
  refresh: 'Sprawdź aktualizacje',
  refreshing: 'Sprawdzanie…',
  refreshed: 'Sprawdzono',
  refreshFailed: 'Sprawdzanie nie powiodło się',

  loadErrorTitle: 'Nie udało się wczytać danych',
  loadErrorSubtitle: 'Sprawdź połączenie z siecią i spróbuj ponownie.',
  retry: 'Ponów',

  noProjects: 'Nie skonfigurowano jeszcze żadnych projektów',
  noRelease: 'Brak wydania',
  noAssets: 'To wydanie nie zawiera plików do pobrania',
  syncError: 'Synchronizacja nie powiodła się',

  versionLabel: 'Wersja',
  viewRepo: 'Zobacz repozytorium',
  openRelease: 'Zobacz stronę wydania',
  download: 'Pobierz',
  releasedAt: 'Opublikowano',

  updatedAt: 'Zaktualizowano',
  never: 'Nigdy nie aktualizowano',
  lastChecked: 'Ostatnie sprawdzenie',
  checkIntervalHint: 'Sprawdzanie aktualizacji co 24 godziny',
  poweredBy: (version) => `Obsługiwane przez biangbiang ${version}`,

  sortLabel: 'Sortuj według',
  sortByName: 'Nazwa',
  sortByUpdated: 'Ostatnio zaktualizowane',
  sortByMostAssets: 'Najwięcej plików',
  sortByLeastAssets: 'Najmniej plików',

  themeLabel: 'Motyw',
  themeAuto: 'Systemowy',
  themeLight: 'Jasny',
  themeDark: 'Ciemny',

  projectsCount: (n) => `${n} ${plural(n, 'projekt', 'projekty', 'projektów')}`,
};
