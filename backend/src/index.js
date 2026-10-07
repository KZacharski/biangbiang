import fs from 'node:fs';
import path from 'node:path';

import express from 'express';

import { env, releasesDir } from './env.js';
import { loadConfig, OVERWRITE_FILE } from './config.js';
import { createStateStore } from './state.js';
import { createMirror } from './mirror.js';
import { startScheduler } from './scheduler.js';
import { generatePwaIcons, PWA_ICON_NAMES } from './pwaIcons.js';
import { generatePwaManifest, MANIFEST_FILE } from './pwaManifest.js';

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

/* ------------------------------------------------------------ app icons -- */

// The installable PWA icons are derived from the configured favicon at startup,
// and the manifest is rewritten from the configured title at the same time.
// Serve both here (before the static handler) and fall back to the bundled
// defaults when generation was skipped or failed.
const pwaDir = path.join(env.dataDir, 'pwa');

for (const name of PWA_ICON_NAMES) {
  app.get(`/${name}`, (_req, res, next) => {
    const file = path.join(pwaDir, name);
    if (fs.existsSync(file)) {
      res.set('Cache-Control', 'public, max-age=300');
      return res.sendFile(file);
    }
    return next();
  });
}

// The manifest is what names the installed app, so it has to be revalidated on
// every load rather than cached - the same rule the static handler applies to it.
app.get(`/${MANIFEST_FILE}`, (_req, res, next) => {
  const file = path.join(pwaDir, MANIFEST_FILE);
  if (!fs.existsSync(file)) return next();
  res.set('Cache-Control', 'no-cache');
  return res.type('application/manifest+json').send(fs.readFileSync(file, 'utf8'));
});

/* ---------------------------------------------------------- static SPA -- */

const spaShellPath = path.join(env.publicDir, 'index.html');
const hasSpa = fs.existsSync(spaShellPath);

// Assigned once config.xml has been parsed, further down: the shell with the
// configured <title> baked into it.
let spaShell = null;

/**
 * Bake the configured title into the SPA shell.
 *
 * The built `index.html` carries the frontend's own placeholder name in both the
 * `<title>` and the iOS home-screen label, so a deployment would otherwise show
 * that name until `/api/state` answers - and keep showing it on the iOS home
 * screen forever. Rewriting both here makes the very first paint correct. The
 * replacers are functions so that a title containing `$&` or `$1` is inserted
 * literally, and the title is escaped because it lands in HTML.
 */
function withTitle(html, title) {
  const escaped = title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return html
    .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escaped}</title>`)
    .replace(
      /(<meta\s+name="apple-mobile-web-app-title"\s+content=")[^"]*(")/,
      (_match, open, close) => `${open}${escaped}${close}`,
    );
}

// A direct hit on `/index.html` would otherwise be answered by the static
// handler below with the un-rewritten shell, so route it through the same copy.
app.get('/index.html', (_req, res, next) => {
  if (!spaShell) return next();
  res.set('Cache-Control', 'no-cache');
  return res.type('html').send(spaShell);
});

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
  if (spaShell) {
    res.set('Cache-Control', 'no-cache');
    return res.type('html').send(spaShell);
  }
  return res.sendFile(spaShellPath);
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

// The installable app icons always follow the user's favicon, and the installed
// app's name always follows <title>, so both are (re)generated on every launch.
await generatePwaIcons({ faviconPath: config.faviconPath, outDir: pwaDir });
await generatePwaManifest({
  title: config.title,
  templatePath: path.join(env.publicDir, MANIFEST_FILE),
  outDir: pwaDir,
});

// Bake that same title into the shell the SPA is served from.
if (hasSpa) {
  spaShell = withTitle(fs.readFileSync(spaShellPath, 'utf8'), config.title);
}

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
