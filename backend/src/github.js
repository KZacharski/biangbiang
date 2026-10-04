import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const API_BASE = 'https://api.github.com';

// GitHub automatically attaches "Source code (zip)" / "Source code (tar.gz)"
// archives to every release. Those are never real assets and must be excluded.
const SOURCE_ARCHIVE_RE = /^source\s*code\s*\(\s*(zip|tar\.gz|tgz)\s*\)$/i;

export function isSourceArchive(name) {
  return SOURCE_ARCHIVE_RE.test(String(name || '').trim());
}

function requestHeaders() {
  const headers = {
    'User-Agent': 'biangbiang',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function normalizeRelease(release) {
  const version = String(release.tag_name || release.name || '').trim();
  const assets = (release.assets || [])
    .filter((asset) => asset && asset.name && !isSourceArchive(asset.name))
    .map((asset) => ({
      name: String(asset.name),
      size: Number(asset.size) || 0,
      url: asset.browser_download_url,
      contentType: asset.content_type || 'application/octet-stream',
    }));

  return {
    version,
    name: String(release.name || release.tag_name || '').trim(),
    publishedAt: release.published_at || null,
    htmlUrl: release.html_url || null,
    assets,
  };
}

/**
 * Fetch the latest release for a repository.
 * Falls back to the releases list when a repo has no release marked "latest"
 * (e.g. only pre-releases exist).
 *
 * @returns {Promise<null|{version:string,name:string,publishedAt:string|null,htmlUrl:string|null,assets:Array}>}
 */
export async function fetchLatestRelease(owner, repo) {
  const latestUrl = `${API_BASE}/repos/${owner}/${repo}/releases/latest`;
  let res = await fetch(latestUrl, { headers: requestHeaders() });

  if (res.status === 404) {
    const listUrl = `${API_BASE}/repos/${owner}/${repo}/releases?per_page=1`;
    res = await fetch(listUrl, { headers: requestHeaders() });
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status} ${res.statusText}`);
    }
    const list = await res.json();
    if (!Array.isArray(list) || list.length === 0) return null;
    return normalizeRelease(list[0]);
  }

  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (!data || !data.tag_name) return null;
  return normalizeRelease(data);
}

/**
 * Stream a single asset to disk, writing to a `.part` file first so a partial
 * download never looks like a complete artifact.
 */
export async function downloadAsset(url, destPath, { onProgress } = {}) {
  const res = await fetch(url, { headers: requestHeaders(), redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed (${res.status}) for ${url}`);
  }

  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  const tmpPath = `${destPath}.part`;

  let received = 0;
  const total = Number(res.headers.get('content-length')) || 0;

  const source = Readable.fromWeb(res.body);
  if (onProgress) {
    source.on('data', (chunk) => {
      received += chunk.length;
      onProgress({ received, total });
    });
  }

  try {
    await pipeline(source, fs.createWriteStream(tmpPath));
    await fsp.rename(tmpPath, destPath);
  } catch (err) {
    await fsp.rm(tmpPath, { force: true }).catch(() => {});
    throw err;
  }
}
