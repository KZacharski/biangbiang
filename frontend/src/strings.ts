/**
 * All user-facing interface text is hardcoded here, in Simplified Chinese
 * (zh-Hans), which is the default and only language of the frontend.
 */
export const strings = {
  appTitleFallback: '发布镜像',

  loading: '加载中…',
  refresh: '立即检查更新',
  refreshing: '正在检查…',
  refreshed: '检查完成',
  refreshFailed: '检查失败',

  loadErrorTitle: '无法加载数据',
  loadErrorSubtitle: '请检查网络连接后重试。',
  retry: '重试',

  noProjects: '配置文件中还没有任何项目',
  noRelease: '暂无发布版本',
  noAssets: '该版本没有可下载的文件',
  syncError: '同步失败',

  versionLabel: '版本',
  viewRepo: '查看原仓库',
  openRelease: '查看发布页面',
  download: '下载',
  releasedAt: '发布于',

  updatedAt: '更新时间',
  never: '尚未更新',
  lastChecked: '上次检查',
  checkIntervalHint: '每 24 小时自动检查更新',
  poweredBy: (version: string) => `由 biangbiang ${version} 提供支持`,

  sortLabel: '排序方式',
  sortByName: '按名称',
  sortByUpdated: '最近更新',
  sortByMostAssets: '文件最多',
  sortByLeastAssets: '文件最少',

  themeLabel: '主题',
  themeAuto: '跟随系统',
  themeLight: '浅色',
  themeDark: '深色',

  projectsCount: (n: number) => `共 ${n} 个项目`,
} as const;

/** Home page of this project, linked from the footer. */
export const REPO_URL = 'https://github.com/xiaomianguan/biangbiang';
