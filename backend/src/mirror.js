import fsp from 'node:fs/promises';
import path from 'node:path';

import { loadConfig } from './config.js';
import { fetchLatestRelease, downloadAsset } from './github.js';
import { loadOverwrite, fileNameFromUrl } from './overwrite.js';

const SEGMENT_RE = /[^A-Za-z0-9._-]/g;

/** Sanitize a value so it is safe to use as a single path segment / URL segment. */
export function safeSegment(value) {
  const cleaned = String(value ?? '').replace(SEGMENT_RE, '_').replace(/^\.+$/, '_');
  return cleaned || '_';
}

/** Sanitize a file name while keeping it recognizable. */
export function safeFileName(value) {
  const base = path
    .basename(String(value ?? ''))
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[\\/]/g, '_');
  return base && base !== '.' && base !== '..' ? base : 'asset';
}

/** Build the public download URL for an artifact. */
export function assetUrl(owner, repo, versionSegment, fileName) {
  return `/dl/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(
    versionSegment,
  )}/${encodeURIComponent(fileName)}`;
}

/** Run async tasks with a bounded concurrency. */
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  const runners = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

async function fileMatches(filePath, expectedSize) {
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) return false;
    if (expectedSize > 0 && stat.size !== expectedSize) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Create the mirror engine.
 *
 * @param {object} options
 * @param {string} options.configPath
 * @param {string} options.releasesDir
 * @param {ReturnType<import('./state.js').createStateStore>} options.store
 * @param {number} [options.concurrency]
 * @param {Console} [options.logger]
 */
export function createMirror({ configPath, releasesDir, store, concurrency = 4, logger = console }) {
  let running = false;

  async function mirrorProject(project, previous) {
    const base = {
      id: project.id,
      name: project.name,
      icon: project.iconUrl,
      repo: project.repo,
      version: null,
      releaseName: null,
      publishedAt: null,
      releaseUrl: null,
      assets: [],
      status: 'pending',
      error: null,
    };

    let release;
    try {
      release = await fetchLatestRelease(project.owner, project.repoName);
    } catch (err) {
      logger.error(`[mirror] ${project.id}: ${err.message}`);
      return {
        ...base,
        version: previous?.version ?? null,
        releaseName: previous?.releaseName ?? null,
        publishedAt: previous?.publishedAt ?? null,
        releaseUrl: previous?.releaseUrl ?? null,
        assets: previous?.assets ?? [],
        status: 'error',
        error: String(err.message || err),
      };
    }

    if (!release || !release.version) {
      return { ...base, status: 'empty' };
    }

    const versionSegment = safeSegment(release.version);
    const projectDir = path.join(releasesDir, project.owner, project.repoName);
    const versionDir = path.join(projectDir, versionSegment);

    try {
      await fsp.mkdir(projectDir, { recursive: true });

      // Remove every other mirrored version - we only ever keep the latest.
      const entries = await fsp.readdir(projectDir, { withFileTypes: true }).catch(() => []);
      await Promise.all(
        entries
          .filter((entry) => entry.isDirectory() && entry.name !== versionSegment)
          .map((entry) => fsp.rm(path.join(projectDir, entry.name), { recursive: true, force: true })),
      );

      await fsp.mkdir(versionDir, { recursive: true });

      const usedNames = new Set();
      const assetPlan = release.assets.map((asset, index) => {
        let fileName = safeFileName(asset.name);
        if (usedNames.has(fileName)) fileName = `${index}-${fileName}`;
        usedNames.add(fileName);
        return { ...asset, fileName, dest: path.join(versionDir, fileName) };
      });

      await mapLimit(assetPlan, concurrency, async (asset) => {
        const ok = await fileMatches(asset.dest, asset.size);
        if (!ok) {
          logger.log(`[mirror] ${project.id}: downloading ${asset.name}`);
          await downloadAsset(asset.url, asset.dest);
        }
      });

      // Drop files that are no longer part of the release.
      const keep = new Set(assetPlan.map((asset) => asset.fileName));
      const present = await fsp.readdir(versionDir, { withFileTypes: true }).catch(() => []);
      await Promise.all(
        present
          .filter((entry) => entry.isFile() && !keep.has(entry.name))
          .map((entry) => fsp.rm(path.join(versionDir, entry.name), { force: true })),
      );

      return {
        ...base,
        version: release.version,
        releaseName: release.name || release.version,
        publishedAt: release.publishedAt,
        releaseUrl: release.htmlUrl || project.repo,
        assets: assetPlan.map((asset) => ({
          name: asset.name,
          size: asset.size,
          url: assetUrl(project.owner, project.repoName, versionSegment, asset.fileName),
        })),
        status: 'ok',
      };
    } catch (err) {
      logger.error(`[mirror] ${project.id}: ${err.message}`);
      return { ...base, status: 'error', error: String(err.message || err) };
    }
  }

  /**
   * Build a card from a manual entry in overwrite.xml.
   *
   * Nothing is fetched or downloaded: the version, the repository link and the
   * download URLs all come straight from the file, and the download buttons
   * point at the external URLs directly. Because there is no release, no
   * "released at" date is set - the card simply omits it.
   */
  function mirrorOverwrite(project, overwriteEntries) {
    const base = {
      id: project.id,
      name: project.name,
      icon: project.iconUrl,
      repo: null,
      version: null,
      releaseName: null,
      publishedAt: null,
      releaseUrl: null,
      assets: [],
      status: 'pending',
      error: null,
    };

    const entry = overwriteEntries.get(project.overwriteId);
    if (!entry) {
      return {
        ...base,
        status: 'error',
        error: `overwrite.xml has no <overwrite> block with <id>${project.overwriteId}</id>`,
      };
    }

    return {
      ...base,
      repo: entry.repo || null,
      releaseUrl: entry.repo || null,
      version: entry.version || null,
      assets: entry.files.map((url, index) => ({
        name: fileNameFromUrl(url, index),
        size: 0, // unknown - the frontend omits the size when it is 0
        url,
      })),
      status: 'ok',
    };
  }

  async function runOnce() {
    if (running) return store.get();
    running = true;

    try {
      const config = loadConfig(configPath);
      const previousById = new Map((store.get().projects || []).map((project) => [project.id, project]));

      // overwrite.xml is only opened when a project actually asks for it, so a
      // GitHub-only configuration never needs the file to exist.
      let overwriteEntries = new Map();
      if (config.usesOverwrite) {
        try {
          overwriteEntries = loadOverwrite(config.overwritePath);
          logger.log(`[mirror] overwrite.xml: ${overwriteEntries.size} manual entr(ies)`);
        } catch (err) {
          logger.error(`[mirror] ${err.message}`);
        }
      }

      const projects = [];
      for (const project of config.projects) {
        projects.push(
          project.type === 'overwrite'
            ? mirrorOverwrite(project, overwriteEntries)
            : await mirrorProject(project, previousById.get(project.id)),
        );
      }

      const now = new Date().toISOString();
      store.set({
        title: config.title,
        sortable: config.sortable,
        accent: config.accent,
        favicon: config.favicon,
        lastUpdated: now,
        lastChecked: now,
        projects,
      });
      await store.save();

      logger.log(`[mirror] cycle complete: ${projects.length} project(s) at ${now}`);
      return store.get();
    } finally {
      running = false;
    }
  }

  return { runOnce, isRunning: () => running };
}
