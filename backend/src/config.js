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

    const parsed = parseRepo(node.repo);
    if (!parsed) {
      // Skip invalid entries but keep going, so one bad entry never breaks the site.
      return;
    }

    const id = parsed.fullName;
    if (seen.has(id)) return;
    seen.add(id);

    const iconRel = asText(node.icon) || '';
    const name = asText(node.name) || parsed.name;

    projects.push({
      id,
      index,
      name,
      owner: parsed.owner,
      repoName: parsed.name,
      repo: parsed.url,
      iconRel,
      iconUrl: iconRel ? `/media/${normalizeRel(iconRel)}` : null,
    });
  });

  return {
    title,
    favicon: faviconRel ? `/media/${faviconRel}` : null,
    faviconPath: faviconRel ? path.resolve(dir, faviconRel) : null,
    projects,
    dir,
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
