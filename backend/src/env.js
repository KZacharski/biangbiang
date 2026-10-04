import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..', '..');

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Node resolves the process's local timezone from TZ at startup. Docker sets it
// explicitly (see the Dockerfile and docker-compose.yml); this fallback only
// fills in the gap when the variable is absent, e.g. when the backend is run
// directly on a development machine. Deployers override it with TZ in their
// Compose file - any IANA zone name works.
if (!process.env.TZ) process.env.TZ = 'Asia/Shanghai';

/**
 * Central place where all environment configuration is resolved.
 */
export const env = {
  port: num(process.env.PORT, 8080),
  host: process.env.HOST || '0.0.0.0',
  tz: process.env.TZ,
  configPath: path.resolve(process.env.CONFIG_PATH || path.join(projectRoot, 'config.xml')),
  dataDir: path.resolve(process.env.DATA_DIR || path.join(projectRoot, 'data')),
  publicDir: path.resolve(process.env.PUBLIC_DIR || path.join(here, '..', 'public')),
  checkIntervalHours: Math.max(0.05, num(process.env.CHECK_INTERVAL_HOURS, 24)),
  mirrorOnStart: process.env.MIRROR_ON_START !== 'false',
  downloadConcurrency: Math.max(1, num(process.env.DOWNLOAD_CONCURRENCY, 4)),
  githubToken: process.env.GITHUB_TOKEN || '',
};

export const releasesDir = path.join(env.dataDir, 'releases');
