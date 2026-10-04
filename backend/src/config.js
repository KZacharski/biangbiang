import fs from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
  parseTagValue: false,
});

/**
 * Coerce a possibly-object XML node into trimmed text.
 */
function asText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    if (typeof value['#text'] !== 'undefined') return String(value['#text']).trim();
    return '';
  }
  return String(value).trim();
}

/**
 * Always return an array, so any number of `<project>` nodes is handled.
 */
function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

/**
 * Name of the companion file holding manual (non-GitHub) project entries. It
 * always sits next to config.xml, and is only read when a project asks for it.
 */
export const OVERWRITE_FILE = 'overwrite.xml';

/**
 * A `<repo>` may point at GitHub, or at a manual entry in overwrite.xml using
 * the form `overwrite@<number>`, where the number is the `<id>` of an
 * `<overwrite>` block in that file.
 */
const OVERWRITE_RE = /^overwrite@(\d+)$/i;

/**
 * Parse an owner/repo pair from the many URL shapes people use.
 * Supports https://github.com/o/r(.git)(/), git@github.com:o/r.git and o/r.
 */
export function parseRepo(input) {
  const raw = asText(input);
  if (!raw) return null;

  let s = raw.trim().replace(/\/+$/, '').replace(/\.git$/i, '');
  let owner = '';
  let name = '';

  let m = s.match(/^https?:\/\/[^/]+\/([^/]+)\/([^/]+)$/i);
  if (m) {
    [, owner, name] = m;
  } else {
    m = s.match(/^git@[^:]+:([^/]+)\/([^/]+)$/i);
    if (m) {
      [, owner, name] = m;
    } else {
      m = s.match(/^([^/]+)\/([^/]+)$/);
      if (m) {
        [, owner, name] = m;
      }
    }
  }

  if (!owner || !name) return null;
  if (!SEGMENT_RE.test(owner) || !SEGMENT_RE.test(name)) return null;

  return {
    owner,
    name,
    fullName: `${owner}/${name}`,
    url: `https://github.com/${owner}/${name}`,
  };
}

/**
 * Load and normalize config.xml.
 *
 * @param {string} configPath absolute path to config.xml
 * @returns {{title:string, favicon:string|null, faviconPath:string|null, projects:Array, dir:string}}
 */
export function loadConfig(configPath) {
  const dir = path.dirname(configPath);
  const xml = fs.readFileSync(configPath, 'utf8');
  const root = parser.parse(xml) || {};

  const title = asText(root.title) || 'Releases';
  const faviconRel = normalizeRel(asText(root.favicon) || '');

  const projects = [];
  const seen = new Set();

  toArray(root.project).forEach((node, index) => {
    if (node === null || typeof node !== 'object') return;

    const repoRaw = asText(node.repo);
    const iconRel = asText(node.icon) || '';
    const iconUrl = iconRel ? `/media/${normalizeRel(iconRel)}` : null;

    // `<repo>overwrite@N</repo>` pulls the project's details from overwrite.xml
    // instead of GitHub. The name/icon still come from config.xml.
    const overwrite = repoRaw.match(OVERWRITE_RE);
    if (overwrite) {
      const overwriteId = Number(overwrite[1]);
      const id = `overwrite:${overwriteId}`;
      if (seen.has(id)) return;
      seen.add(id);

      projects.push({
        type: 'overwrite',
        id,
        index,
        overwriteId,
        name: asText(node.name) || `overwrite@${overwriteId}`,
        repo: null, // filled in from overwrite.xml
        releaseUrl: null,
        iconRel,
        iconUrl,
      });
      return;
    }

    const parsed = parseRepo(repoRaw);
    if (!parsed) {
      // Skip invalid entries but keep going, so one bad entry never breaks the site.
      return;
    }

    const id = parsed.fullName;
    if (seen.has(id)) return;
    seen.add(id);

    projects.push({
      type: 'github',
      id,
      index,
      name: asText(node.name) || parsed.name,
      owner: parsed.owner,
      repoName: parsed.name,
      repo: parsed.url,
      iconRel,
      iconUrl,
    });
  });

  return {
    title,
    favicon: faviconRel ? `/media/${faviconRel}` : null,
    faviconPath: faviconRel ? path.resolve(dir, faviconRel) : null,
    projects,
    dir,
    // overwrite.xml sits next to config.xml. It is only read when at least one
    // project actually asks for it, so GitHub-only setups never need the file.
    overwritePath: path.join(dir, OVERWRITE_FILE),
    usesOverwrite: projects.some((project) => project.type === 'overwrite'),
  };
}

/**
 * Normalize a relative asset path into a clean, forward-slash relative URL.
 */
function normalizeRel(rel) {
  return String(rel)
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .split('/')
    .filter((part) => part && part !== '.')
    .join('/');
}
