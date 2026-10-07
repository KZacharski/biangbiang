import type { Messages } from './types';

/** Swedish (sv-SE). "projekt" is unchanged in the plural, so no helper is needed. */
export const sv_se: Messages = {
  appTitleFallback: 'Releasespegel',

  loading: 'Laddar…',
  refresh: 'Sök efter uppdateringar',
  refreshing: 'Söker…',
  refreshed: 'Sökningen klar',
  refreshFailed: 'Sökningen misslyckades',

  loadErrorTitle: 'Kunde inte ladda data',
  loadErrorSubtitle: 'Kontrollera nätverksanslutningen och försök igen.',
  retry: 'Försök igen',

  noProjects: 'Inga projekt har konfigurerats än',
  noRelease: 'Ingen utgåva än',
  noAssets: 'Den här utgåvan har inga filer att ladda ner',
  syncError: 'Synkroniseringen misslyckades',

  versionLabel: 'Version',
  viewRepo: 'Visa kodförråd',
  openRelease: 'Visa utgåvan',
  download: 'Ladda ner',
  releasedAt: 'Publicerad',

  updatedAt: 'Uppdaterad',
  never: 'Aldrig uppdaterad',
  lastChecked: 'Senast kontrollerad',
  checkIntervalHint: 'Söker efter uppdateringar var 24:e timme',
  poweredBy: (version) => `Drivs av biangbiang ${version}`,

  sortLabel: 'Sortera efter',
  sortByName: 'Namn',
  sortByUpdated: 'Senast uppdaterad',
  sortByMostAssets: 'Flest filer',
  sortByLeastAssets: 'Minst filer',

  themeLabel: 'Tema',
  themeAuto: 'System',
  themeLight: 'Ljust',
  themeDark: 'Mörkt',

  projectsCount: (n) => `${n} projekt`,
};
