import fs from 'node:fs';
import path from 'node:path';

import express from 'express';

import { env, releasesDir } from './env.js';
import { loadConfig, OVERWRITE_FILE } from './config.js';
import { createStateStore } from './state.js';
import { createMirror } from './mirror.js';
import { startScheduler } from './scheduler.js';
import { generatePwaIcons, PWA_ICON_NAMES } from './pwaIcons.js';

const store = createStateStore(env.dataDir);
const mirror = createMirror({
  configPath: env.configPath,
  releasesDir,
  store,
  concurrency: env.downloadConcurrency,
});

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

/* ------------------------------------------------------------------ API -- */

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/state', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(store.get());
});

app.post('/api/refresh', async (_req, res) => {
  try {
    const state = await mirror.runOnce();
    res.json({ ok: true, state });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

/* --------------------------------------------------- config assets/media -- */

const configDir = path.dirname(env.configPath);
// config.xml and its companion overwrite.xml describe the deployment, so they
// are never served as media even though they sit next to the project icons.
const configFileNames = new Set([path.basename(env.configPath), OVERWRITE_FILE]);

// Icons are small and an operator may replace one in place, so they keep the
// short cache that lets a change show up within minutes. A font is a different
// story: it is measured in megabytes and it is effectively immutable, because
// changing the typeface means pointing `<font>` at a different file, which is a
// different URL. Re-fetching it every five minutes would cost far more than the
// staleness is worth, so fonts get 30 days. Swapping the contents of the same
// path is the one case that lingers; a rename or a cache-busting query clears
// it immediately.
const FONT_FILE_RE = /\.(woff2?|ttf|otf)$/i;
const MEDIA_CACHE = 'public, max-age=300';
const FONT_CACHE = 'public, max-age=2592000';

app.get('/media/*', (req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(req.params[0] || '');
  } catch {
    return res.status(400).end();
  }

  const target = path.resolve(configDir, rel);
  const within = target === configDir || target.startsWith(configDir + path.sep);
  if (!within) return res.status(403).end();
  if (configFileNames.has(path.basename(target))) return res.status(404).end();

  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return res.status(404).end();
  }
  if (!stat.isFile()) return res.status(404).end();

  res.set('Cache-Control', FONT_FILE_RE.test(target) ? FONT_CACHE : MEDIA_CACHE);
  return res.sendFile(target);
});

/* ------------------------------------------------------- mirrored files -- */

const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

app.get('/dl/:owner/:repo/:version/:file', (req, res) => {
  const { owner, repo, version } = req.params;
  if (!SEGMENT_RE.test(owner) || !SEGMENT_RE.test(repo) || !SEGMENT_RE.test(version)) {
    return res.status(400).end();
  }

  let fileName;
  try {
    fileName = path.basename(decodeURIComponent(req.params.file));
  } catch {
    return res.status(400).end();
  }

  const target = path.resolve(releasesDir, owner, repo, version, fileName);
  if (!target.startsWith(releasesDir + path.sep)) return res.status(403).end();

  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return res.status(404).end();
  }
  if (!stat.isFile()) return res.status(404).end();

  res.set('Cache-Control', 'public, max-age=300');
  return res.download(target, fileName);
});

/* ------------------------------------------------------------- app icons -- */

// The installable PWA icons are generated from the configured favicon at
// startup. Serve them here (before the static handler) and fall back to the
// bundled defaults when generation was skipped or failed.
const pwaIconDir = path.join(env.dataDir, 'pwa');

for (const name of PWA_ICON_NAMES) {
  app.get(`/${name}`, (_req, res, next) => {
    const file = path.join(pwaIconDir, name);
    if (fs.existsSync(file)) {
      res.set('Cache-Control', 'public, max-age=300');
      return res.sendFile(file);
    }
    return next();
  });
}

/* ---------------------------------------------------------- static SPA -- */

const hasSpa = fs.existsSync(path.join(env.publicDir, 'index.html'));

app.use(
  express.static(env.publicDir, {
    index: false,
    setHeaders(res, filePath) {
      if (/(^|[\\/])(sw\.js|manifest\.webmanifest)$/.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }),
);

app.get('*', (req, res, next) => {
  if (/^\/(api|dl|media)(\/|$)/.test(req.path)) return next();
  if (!hasSpa) return res.status(503).send('Frontend build not found.');
  return res.sendFile(path.join(env.publicDir, 'index.html'));
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

/* ------------------------------------------------------------- startup -- */

// config.xml is required for the service to do anything useful, so fail fast
// with a clear message instead of starting up with an empty site.
let config;
try {
  config = loadConfig(env.configPath);
} catch (err) {
  console.error(`[server] cannot read config.xml at ${env.configPath}: ${err.message}`);
  process.exit(1);
}

// The installable app icons always follow the user's favicon, so (re)generate
// them from it with ImageMagick on every launch.
await generatePwaIcons({ faviconPath: config.faviconPath, outDir: pwaIconDir });

await store.load();

const server = app.listen(env.port, env.host, () => {
  console.log(`[server] listening on http://${env.host}:${env.port}`);
  console.log(`[server] config: ${env.configPath}`);
  console.log(`[server] data:   ${env.dataDir}`);
  console.log(`[server] timezone: ${env.tz}`);
  console.log(`[server] check interval: ${env.checkIntervalHours}h`);
});

if (env.mirrorOnStart) {
  mirror.runOnce().catch((err) => console.error('[mirror] initial run failed:', err));
}

startScheduler({
  run: () => mirror.runOnce(),
  intervalHours: env.checkIntervalHours,
  onError: (err) => console.error('[mirror] scheduled run failed:', err),
});

function shutdown(signal) {
  console.log(`[server] ${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
