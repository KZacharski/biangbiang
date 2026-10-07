import type { Messages } from './types';

/** Traditional Chinese (zh-TW), using Taiwan's vocabulary and full-width punctuation. */
export const zh_tw: Messages = {
  appTitleFallback: '發佈鏡像',

  loading: '載入中…',
  refresh: '立即檢查更新',
  refreshing: '正在檢查…',
  refreshed: '檢查完成',
  refreshFailed: '檢查失敗',

  loadErrorTitle: '無法載入資料',
  loadErrorSubtitle: '請檢查網路連線後重試。',
  retry: '重試',

  noProjects: '設定檔中還沒有任何專案',
  noRelease: '尚無發佈版本',
  noAssets: '此版本沒有可下載的檔案',
  syncError: '同步失敗',

  versionLabel: '版本',
  viewRepo: '查看原始倉庫',
  openRelease: '查看發佈頁面',
  download: '下載',
  releasedAt: '發佈於',

  updatedAt: '更新時間',
  never: '尚未更新',
  lastChecked: '上次檢查',
  checkIntervalHint: '每 24 小時自動檢查更新',
  poweredBy: (version) => `由 biangbiang ${version} 提供`,

  sortLabel: '排序方式',
  sortByName: '依名稱',
  sortByUpdated: '最近更新',
  sortByMostAssets: '檔案最多',
  sortByLeastAssets: '檔案最少',

  themeLabel: '主題',
  themeAuto: '跟隨系統',
  themeLight: '淺色',
  themeDark: '深色',

  projectsCount: (n) => `共 ${n} 個專案`,
};
