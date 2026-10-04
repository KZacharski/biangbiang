import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Icon file names referenced by `manifest.webmanifest` and `index.html`.
 * These are generated from the user's configured favicon on every launch.
 */
export const PWA_ICON_NAMES = [
  'pwa-192x192.png',
  'pwa-512x512.png',
  'pwa-maskable-512x512.png',
  'apple-touch-icon.png',
];

async function hasBinary(bin) {
  try {
    await execFileAsync(bin, ['-version'], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * ImageMagick 7 exposes `magick`; ImageMagick 6 only `convert`.
 * Returns the first available binary, or null when ImageMagick is missing.
 */
export async function resolveImageMagick() {
  for (const bin of ['magick', 'convert']) {
    // eslint-disable-next-line no-await-in-loop
    if (await hasBinary(bin)) return bin;
  }
  return null;
}

/** Average colour of the image (used to fill the maskable icon's padding). */
async function averageHex(bin, src) {
  try {
    const { stdout } = await execFileAsync(bin, [
      src,
      '-background',
      'white',
      '-flatten',
      '-resize',
      '1x1',
      '-format',
      '%[hex:p{0,0}]',
      'info:',
    ]);
    const hex = stdout.trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6,8}$/.test(hex)) return null;
    // `%[hex:...]` may include the alpha channel; keep RGB only.
    return hex.slice(0, 6);
  } catch {
    return null;
  }
}

/**
 * Derive the PWA icon set from the configured favicon.
 *
 * Always called on startup, so the installable app icons track whatever the
 * user points `<favicon>` at. Returns the output directory on success, or
 * `null` when generation was skipped (no favicon / no ImageMagick / failure),
 * in which case the bundled default icons are served instead.
 *
 * @param {object} options
 * @param {string|null} options.faviconPath absolute path to the user's favicon
 * @param {string} options.outDir directory to write the generated icons into
 * @param {Console} [options.logger]
 */
export async function generatePwaIcons({ faviconPath, outDir, logger = console }) {
  if (!faviconPath) {
    logger.warn('[pwa] no <favicon> configured - using default app icons');
    return null;
  }
  if (!fs.existsSync(faviconPath)) {
    logger.warn(`[pwa] favicon not found at ${faviconPath} - using default app icons`);
    return null;
  }

  const bin = await resolveImageMagick();
  if (!bin) {
    logger.warn('[pwa] ImageMagick not available - using default app icons');
    return null;
  }

  const out = (name) => path.join(outDir, name);

  try {
    await fsp.mkdir(outDir, { recursive: true });

    // Standard icons: keep transparency, pad to an exact square.
    await execFileAsync(bin, [
      faviconPath,
      '-resize',
      '192x192',
      '-background',
      'none',
      '-gravity',
      'center',
      '-extent',
      '192x192',
      out('pwa-192x192.png'),
    ]);
    await execFileAsync(bin, [
      faviconPath,
      '-resize',
      '512x512',
      '-background',
      'none',
      '-gravity',
      'center',
      '-extent',
      '512x512',
      out('pwa-512x512.png'),
    ]);

    // iOS home-screen icon: no transparency (iOS composites onto black).
    await execFileAsync(bin, [
      faviconPath,
      '-background',
      'white',
      '-flatten',
      '-resize',
      '180x180',
      '-background',
      'white',
      '-gravity',
      'center',
      '-extent',
      '180x180',
      out('apple-touch-icon.png'),
    ]);

    // Maskable icon: fill the whole square, keeping the logo inside the safe zone.
    const bg = (await averageHex(bin, faviconPath)) || 'ffffff';
    await execFileAsync(bin, [
      faviconPath,
      '-background',
      `#${bg}`,
      '-flatten',
      '-resize',
      '410x410',
      '-background',
      `#${bg}`,
      '-gravity',
      'center',
      '-extent',
      '512x512',
      out('pwa-maskable-512x512.png'),
    ]);

    logger.log(`[pwa] generated app icons from ${faviconPath}`);
    return outDir;
  } catch (err) {
    logger.error(`[pwa] icon generation failed: ${err.message}`);
    return null;
  }
}
