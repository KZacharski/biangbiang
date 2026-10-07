import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * The web app manifest's file name, as referenced by `index.html`'s
 * `<link rel="manifest">`.
 */
export const MANIFEST_FILE = 'manifest.webmanifest';

/**
 * Write the web app manifest under the site's configured name.
 *
 * The manifest is what the browser uses for the installed app's name, so it is
 * derived from `<title>` at every launch - exactly the way the icons are derived
 * from `<favicon>`. Everything else (description, colours, the icon list) is
 * carried over from the manifest that ships with the frontend build, so the two
 * never drift apart.
 *
 * @param {object} options
 * @param {string} options.title configured site title
 * @param {string} options.templatePath absolute path to the bundled manifest
 * @param {string} options.outDir directory to write the generated manifest into
 * @param {Console} [options.logger]
 * @returns {Promise<string|null>} the written path, or `null` when generation was
 *   skipped (unreadable template, or a failed write), in which case the bundled
 *   default manifest is served instead.
 */
export async function generatePwaManifest({
  title,
  templatePath,
  outDir,
  logger = console,
}) {
  let template;
  try {
    template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  } catch (err) {
    logger.warn(
      `[pwa] cannot read ${templatePath} (${err.message}) - using the default app name`,
    );
    return null;
  }

  const out = path.join(outDir, MANIFEST_FILE);
  const manifest = { ...template, name: title, short_name: title };

  try {
    await fsp.mkdir(outDir, { recursive: true });
    await fsp.writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`);
    logger.log(`[pwa] app name set to "${title}"`);
    return out;
  } catch (err) {
    logger.error(`[pwa] manifest generation failed: ${err.message}`);
    return null;
  }
}
