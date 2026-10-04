import fs from 'node:fs';

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
 * Always return an array, so any number of child nodes is handled.
 */
function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Derive a readable file name from a download URL.
 *
 * External links have no file name metadata, so the last path segment is used -
 * this is what the download button on the card displays. Falls back to a
 * positional name for URLs that carry no usable segment.
 */
export function fileNameFromUrl(rawUrl, index = 0) {
  const value = String(rawUrl || '').trim();
  let pathname = value.split(/[?#]/)[0];

  try {
    pathname = new URL(value).pathname;
  } catch {
    // Not an absolute URL - keep the stripped raw value.
  }

  const segment = pathname.split('/').filter(Boolean).pop() || '';
  if (!segment) return `file-${index + 1}`;

  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Parse overwrite.xml: the manual, non-GitHub half of the site.
 *
 * Structure:
 *
 *   <overwrite>
 *     <id>1</id>
 *     <version>1.0.0</version>
 *     <repo>https://example.com/project</repo>
 *     <downloads>
 *       <file>https://example.com/artifact.zip</file>
 *     </downloads>
 *   </overwrite>
 *
 * `<id>` is matched against the `overwrite@<id>` value of a `<repo>` tag in
 * config.xml. Returns a Map of id -> entry. Blocks without a numeric `<id>` are
 * skipped; the first block wins if an id is repeated.
 *
 * @param {string} filePath absolute path to overwrite.xml
 * @returns {Map<number, {id:number, version:string, repo:string, files:string[]}>}
 */
export function loadOverwrite(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`overwrite.xml not found at ${filePath}`);
  }

  const xml = fs.readFileSync(filePath, 'utf8');
  const root = parser.parse(xml) || {};
  const entries = new Map();

  for (const node of toArray(root.overwrite)) {
    if (node === null || typeof node !== 'object') continue;

    const idText = asText(node.id);
    if (!/^\d+$/.test(idText)) continue;

    const id = Number(idText);
    if (entries.has(id)) continue;

    // `<downloads>` may be absent, empty, or hold one or many `<file>` tags.
    const downloads = node.downloads === undefined ? undefined : node.downloads;
    const fileNodes = downloads && typeof downloads === 'object' ? downloads.file : undefined;

    entries.set(id, {
      id,
      version: asText(node.version),
      repo: asText(node.repo),
      files: toArray(fileNodes)
        .map((file) => asText(file))
        .filter(Boolean),
    });
  }

  return entries;
}
