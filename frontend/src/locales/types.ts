/**
 * The shape of every message bundle. Each locale implements this in full, so a
 * missing or misspelled key is a type error rather than a blank label.
 */
export interface Messages {
  appTitleFallback: string;

  loading: string;
  refresh: string;
  refreshing: string;
  refreshed: string;
  refreshFailed: string;

  loadErrorTitle: string;
  loadErrorSubtitle: string;
  retry: string;

  noProjects: string;
  noRelease: string;
  noAssets: string;
  syncError: string;

  versionLabel: string;
  viewRepo: string;
  openRelease: string;
  download: string;
  releasedAt: string;

  updatedAt: string;
  never: string;
  lastChecked: string;
  checkIntervalHint: string;
  poweredBy: (version: string) => string;

  sortLabel: string;
  sortAlphabetical: string;
  sortByUpdated: string;
  sortByMostAssets: string;
  sortByLeastAssets: string;

  themeLabel: string;
  themeAuto: string;
  themeLight: string;
  themeDark: string;

  projectsCount: (n: number) => string;
}

/**
 * Interface language codes, exactly as config.xml `<lang>` spells them. The
 * order here is the order the languages are presented in the documentation.
 */
export type Locale = 'zh_cn' | 'zh_tw' | 'en_us' | 'pl_pl' | 'ru_ru' | 'sv_se';
