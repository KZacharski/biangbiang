import type { Messages } from './types';

/** English (en-US). */
export const en_us: Messages = {
  appTitleFallback: 'Release Mirror',

  loading: 'Loading…',
  refresh: 'Check for updates',
  refreshing: 'Checking…',
  refreshed: 'Check complete',
  refreshFailed: 'Check failed',

  loadErrorTitle: 'Could not load data',
  loadErrorSubtitle: 'Check your network connection and try again.',
  retry: 'Retry',

  noProjects: 'No projects configured yet',
  noRelease: 'No release yet',
  noAssets: 'This release has no downloadable files',
  syncError: 'Sync failed',

  versionLabel: 'Version',
  viewRepo: 'View repository',
  openRelease: 'View release page',
  download: 'Download',
  releasedAt: 'Released',

  updatedAt: 'Updated',
  never: 'Never updated',
  lastChecked: 'Last checked',
  checkIntervalHint: 'Checks for updates every 24 hours',
  poweredBy: (version) => `Powered by biangbiang ${version}`,

  sortLabel: 'Sort by',
  sortByName: 'Name',
  sortByUpdated: 'Recently updated',
  sortByMostAssets: 'Most files',
  sortByLeastAssets: 'Fewest files',

  themeLabel: 'Theme',
  themeAuto: 'System',
  themeLight: 'Light',
  themeDark: 'Dark',

  projectsCount: (n) => (n === 1 ? '1 project' : `${n} projects`),
};
