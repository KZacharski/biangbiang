export type ProjectStatus = 'ok' | 'empty' | 'error' | 'pending';

export interface Artifact {
  name: string;
  size: number;
  url: string;
}

export interface Project {
  id: string;
  name: string;
  icon: string | null;
  /** Repository link. Null for manual overwrite.xml entries that omit <repo>. */
  repo: string | null;
  version: string | null;
  releaseName: string | null;
  publishedAt: string | null;
  releaseUrl: string | null;
  assets: Artifact[];
  status: ProjectStatus;
  error: string | null;
}

export interface SiteState {
  title: string;
  /** Whether visitors may re-sort the cards (config.xml `<sortable>`). */
  sortable: boolean;
  /** Accent colour as a hex string, resolved from config.xml `<accent>`. */
  accent: string;
  /** Font file URL from config.xml `<font>`, or null to use the system stack. */
  font: string | null;
  favicon: string | null;
  lastUpdated: string | null;
  lastChecked: string | null;
  projects: Project[];
}

export async function fetchState(): Promise<SiteState> {
  const res = await fetch('/api/state', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return (await res.json()) as SiteState;
}

export async function triggerRefresh(): Promise<void> {
  const res = await fetch('/api/refresh', { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/** Human readable file size, e.g. "12.4 MB". */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 || unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

/** Format an ISO timestamp in the browser's locale, zh-Hans by default. */
export function formatDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-Hans', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
