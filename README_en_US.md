# biangbiang

[简体中文](README.md) · **English**

![100% SLOP — but this badge is human-made](.github/assets/slop_badge.webp)

An all-in-one, self-hosted **GitHub release artifact mirror**. It tracks the
latest release of every project listed in `config.xml`, downloads the build
artifacts to your server, and serves them through a fast, mobile-friendly
Vue + [Ant Design Vue](https://antdv.com) frontend.

The whole project runs inside **a single Docker container**: one Node.js
(Express) process serves the API, the mirrored files, and the built SPA.

> Repository: <https://github.com/xiaomianguan/biangbiang/>
> Deployment docs: [Advanced Deployment Guide (English)](ADVANCED_INSTRUCTION_en_US.md) · [进阶部署指南（简体中文）](ADVANCED_INSTRUCTION_zh_CN.md)

---

## Features

- **Works out of the box**: the repository ships a ready-to-use `config.xml`,
  `overwrite.xml` and `assets/` (favicon, project icons and a bundled font).
  Clone it and `docker compose up -d --build` gives you a complete site with
  nothing to prepare first — build on the sample, or delete it and start from
  scratch.
- **Automatic mirroring** of every build artifact attached to a GitHub release.
- **Source archives excluded** — the `Source code (zip)` / `Source code (tar.gz)`
  archives that GitHub attaches automatically are never mirrored.
- **Checks for updates every 24 hours** (configurable), and keeps only the latest
  version of each project on disk.
- **Any number of projects** — one `<project>` in `config.xml` becomes one card.
- **Manual entries** — writing `<repo>overwrite@{number}</repo>` sources that card from `overwrite.xml` instead, so GitHub projects and arbitrary external download links can be mixed on one site.
- **Fully configuration-driven**: title, favicon, and each project's
  icon/name/repository all come from `config.xml`; icons are ordinary PNG/WEBP
  files, and the repo ships a ready-to-use sample set you can swap out freely.
- **Optional card sorting**: set `<sortable>true</sortable>` and a sort dropdown
  appears in the header, letting visitors re-order the cards by name, last
  updated, most assets or least assets. With `false` (or the tag omitted) the
  cards keep the exact order of `config.xml`.
- **Configurable accent colour**: give `<accent>` the name of any colour in
  Ant Design's [base palettes](https://ant.design/docs/spec/colors) — e.g.
  `volcano` or `purple` — and the site uses it in place of the default brand
  blue. Omit it (or misspell it) and the site stays blue.
- **Configurable font**: point `<font>` at a font file (e.g. `.woff2`) and the
  whole site — Ant Design components included — switches to it. The path is
  resolved relative to `config.xml`, exactly like `<favicon>`. Omit it, or point
  it at a file that is not there, and the site keeps its system font.
- **Light / dark theme**, defaulting to "follow system", with manual overrides.
  Implemented with Ant Design Vue design tokens.
- **Installable as a PWA** (manifest + service worker) — with **no offline
  caching**, by design. The app name follows `<title>`; the icons follow
  `<favicon>`.
- **Simplified Chinese (zh-Hans)** interface, with hardcoded copy.
- **Responsive card grid** — one column on phones, two on tablets, three on
  desktop. Every card is sized to its own content and is never stretched to
  match the tallest card in its row. A short card also floats up into the free
  space beneath it, so cards stay exactly 16px apart: Safari 26.4+ does this
  natively with Grid Lanes, and the frontend lays the cards out itself anywhere
  else.
- **Robust**: one broken or misspelled repository never takes the site down —
  a project that fails to sync keeps its last successfully mirrored data. The
  sample configuration deliberately keeps two failing cards to demonstrate it.

---

## How it works

```text
                        every 24 h  ┌──────────────────────────────┐
         GitHub REST API ─────────► │  Mirror engine (backend)     │
    (releases/latest)               │  · fetch latest release      │
                                    │  · download build artifacts  │
                                    │  · delete old versions       │
                                    └──────────────┬───────────────┘
                                                   │ write
                                                   ▼
                                  data/releases/{owner}/{repo}/{version}/{file}
                                                   │
    browser ──► Express ───────────────────────────┘
                  ├─ /                  → built Vue SPA (static files)
                  ├─ /api/state         → live JSON: title, projects, versions, artifacts
                  ├─ /media/{path}      → favicon and project icons from the config directory
                  └─ /dl/{owner}/{repo}/{version}/{file}  → mirrored build artifacts
```

The frontend is a **static bundle**, but the data it renders is fetched at
runtime via `GET /api/state`. When a new release is mirrored, the version tag
and the set of download buttons update automatically — **the frontend never
needs to be rebuilt**. The page also refreshes its data periodically (and when
the tab regains focus) so long-lived pages stay current.

---

## Project structure

```text
biangbiang/
├── .github/assets/         # README badge
├── config.xml              # site config (mounted); ships with a working sample
├── overwrite.xml           # manual (non-GitHub) entries (mounted); sample ships too
├── assets/                 # favicon, project icons, font (mounted ro); sample ships
├── data/                   # mirrored artifacts, state.json, generated PWA icons + manifest
├── backend/                # Node.js + Express API / mirror engine
│   └── src/
│       ├── index.js        # HTTP server: SPA, /api, /media, /dl
│       ├── cli.js          # one-shot mirror run (npm run mirror)
│       ├── config.js       # parses config.xml + normalizes repository URLs
│       ├── github.js       # GitHub API client + streaming downloads
│       ├── mirror.js       # mirror engine (compare, download, clean up)
│       ├── overwrite.js    # parses overwrite.xml (manual entries)
│       ├── pwaIcons.js     # derives PWA icons from the favicon with ImageMagick
│       ├── pwaManifest.js  # derives the manifest's app name from <title>
│       ├── scheduler.js    # the every-24-hours scheduled task
│       ├── state.js        # in-memory + persisted state
│       └── env.js          # environment variable configuration
├── frontend/               # Vue 3 + Vite + Ant Design Vue SPA
│   ├── public/             # manifest, service worker, default PWA icons
│   └── src/
│       ├── App.vue         # ConfigProvider (theme + zh-CN locale)
│       ├── api.ts          # API client and formatting helpers
│       ├── theme.ts        # auto / light / dark theme logic
│       ├── strings.ts      # hardcoded Simplified Chinese UI copy
│       └── components/     # SiteView, ProjectCard, ThemeSwitcher
├── Dockerfile
├── docker-compose.yml             # minimal example
├── docker-compose.advanced.yml    # production example (loopback-only + nginx)
├── .env.example                   # copy to .env and fill in
├── ADVANCED_INSTRUCTION_zh_CN.md  # advanced deployment guide (Simplified Chinese)
├── ADVANCED_INSTRUCTION_en_US.md  # advanced deployment guide (American English)
├── README_en_US.md                # README (American English)
└── README.md
```

---

## Configuration (`config.xml`)

`config.xml` lives next to the `assets/` directory. All image paths are resolved
**relative to the directory containing `config.xml`**, so icons can sit either
alongside it or in the `assets/` subdirectory.

```xml
<favicon>assets/favicon.png</favicon>
<title>Page title</title>
<sortable>true</sortable>
<accent>volcano</accent>
<font>assets/MyFont.woff2</font>

<project>
    <icon>assets/icon1.png</icon>
    <name>Project 1</name>
    <repo>https://github.com/user/project1</repo>
</project>

<project>
    <icon>assets/icon2.webp</icon>
    <name>Project 2</name>
    <repo>https://github.com/user/project2</repo>
</project>
```

| Tag          | Location     | Description |
|--------------|----------------|------|
| `<title>`    | root         | Site title, shown in the header, the browser tab, and as the **installed app's name** (written into the manifest at every launch). |
| `<favicon>`  | root         | Optional. PNG/WEBP file used as the site favicon. |
| `<sortable>` | root         | Optional. When `true`, a sort dropdown appears in the header and visitors can re-order the cards by name, last updated, most assets or least assets — name (alphabetical) is the default. When `false` (or omitted), the cards keep the exact order of the `<project>` entries. |
| `<accent>`   | root         | Optional. Name of an Ant Design base palette — `red`, `volcano`, `orange`, `gold`, `yellow`, `lime`, `green`, `cyan`, `blue`, `geekblue`, `purple` or `magenta` (case-insensitive). Replaces the site's default brand blue (Daybreak Blue). Omitted, empty or unrecognised values all fall back to the default blue. |
| `<font>`     | root         | Optional. Path to a font file (e.g. `assets/MyFont.woff2`), resolved relative to `config.xml` exactly like `<favicon>`. The whole site — Ant Design components included — switches to it. Omitted, empty, or a file that is not there all fall back to the system font. |
| `<project>`  | root (0..N)  | One entry per project → one card on the site. |
| `<icon>`    | inside a project | PNG/WEBP file used as the card icon. Optional. |
| `<name>`    | inside a project | Project display name. |
| `<repo>`    | inside a project | GitHub repository URL. |

**Supported `<repo>` formats** (all resolve to `owner/repo`):

```text
https://github.com/user/project1
https://github.com/user/project1.git
https://github.com/user/project1/
git@github.com:user/project1.git
user/project1
```

Add or remove `<project>` sections freely — the site always renders exactly one
card per valid entry. Entries with a missing or malformed `<repo>` are skipped
without affecting the others.

### Manual entries (`overwrite.xml`)

A `<repo>` can also be written as `overwrite@{number}`. That card's data then
comes from an `overwrite.xml` file sitting **next to `config.xml`** instead of
from GitHub:

```xml
<project>
    <icon>assets/icon2.webp</icon>
    <name>My private project</name>
    <repo>overwrite@1</repo>
</project>
```

The structure of `overwrite.xml`:

```xml
<overwrite>
    <id>1</id>
    <version>1.0.0</version>
    <repo>https://example.com/my-project</repo>
    <downloads>
        <file>https://example.com/artifact.zip</file>
        <file>https://example.com/artifact2.rar</file>
    </downloads>
</overwrite>
```

| Tag | Description |
|---|---|
| `<id>` | Matches the number in `overwrite@{number}` in `config.xml`. |
| `<version>` | Version shown on the card, instead of an auto-fetched one. Optional. |
| `<repo>` | URL the "view original repo" button links to. Optional — the button is hidden when it is omitted. |
| `<downloads>/<file>` | One download button per `<file>`, linking straight to that external URL. |

Worth knowing:

- `overwrite.xml` is read **only** when at least one `overwrite@{number}` exists in `config.xml`. If every `<repo>` is a GitHub URL, the file is never opened.
- Manual entries **download and cache nothing** — the download buttons point straight at the URLs you supply, so they use no server disk space and are unaffected by GitHub rate limits.
- Manual entries **show no "released at" date** (there is no release to date) and no file size (it is unknown).
- GitHub projects and manual entries can be mixed freely within one `config.xml`.
- The file name shown on a download button is the last path segment of its URL.
- Docker deployments mount `overwrite.xml` read-only alongside `config.xml`, so there is nothing extra to set up.

> **The repository ships a complete, working sample set.** A fresh clone already
> contains `config.xml`, `overwrite.xml` and `assets/` — favicon, project icons
> and a bundled font — so `docker compose up -d --build` renders a full site with
> nothing to edit. To make it yours, swap the files in `assets/` and reference
> them from the configuration; to start from scratch, delete the samples and keep
> only your own.

---

## Quick start (Docker)

> **Deploying to a public server?** See the advanced guides:
> [Simplified Chinese](ADVANCED_INSTRUCTION_zh_CN.md) ·
> [English](ADVANCED_INSTRUCTION_en_US.md).
> They cover the `docker-compose.advanced.yml` example, a detailed `config.xml`
> reference, how to place your image assets, and how to put the container behind
> an nginx reverse proxy on your own domain with HTTPS.

### 1. Get the project

Clone the repository, then check out the **latest stable release** (the newest
release tag):

```bash
git clone https://github.com/xiaomianguan/biangbiang.git
cd biangbiang
git checkout "$(git tag --sort=-v:refname | head -1)"   # the latest release tag
```

> **Prefer the git development version (tracking `main`)?** Skip the final
> `git checkout` and you stay on `main`. It carries the newest changes, but they
> have not been released yet and it may be unstable.

### 2. Prepare the configuration and icons (optional — a working sample ships with the repo)

```
biangbiang/
├── config.xml
├── overwrite.xml           # manual entries: only needed for overwrite@{number}
└── assets/
    ├── favicon.png
    ├── icon1.png
    └── icon2.webp
```

A fresh clone **already contains** all of the above, so this step is optional:
`docker compose up -d --build` gives you a complete site right away. To make it
your own, edit `config.xml` and fill in the site title and your projects (syntax
in the previous section), then replace the images in `assets/`.

> **The sample configuration contains two deliberately broken cards.** The
> bundled `config.xml` uses `https://github.com/user/project2` (a repository that
> does not exist) and `overwrite@2` (no matching `<id>` in `overwrite.xml`) to
> demonstrate the two failure states — they show how the site behaves when a repo
> is misspelled or a manual entry is missing. That is intended, not a bug. Delete
> them or point them at your own projects.

> **Using manual entries?** Just fill them in `overwrite.xml` — `docker-compose.yml`
> already mounts it into the container.
>
> Press 立即检查更新 in the UI after editing the file on the host and the change
> takes effect; no rebuild is needed.
>
> Keep the file present: if `./overwrite.xml` is missing, Docker creates an empty
> directory at that path instead and the affected cards fail with `EISDIR`. A
> fresh clone ships a working example, so this only affects you if you deleted it.

### 3. Build and start

```bash
docker compose up -d --build
```

### 4. Open the site

Browse to <http://localhost:8080>.

The first sync starts as soon as the container boots; after that it runs every
24 hours (see `CHECK_INTERVAL_HOURS`). Mirrored artifacts are stored in the
host's `./data` directory and survive restarts.

### Running without Compose

```bash
docker build -t biangbiang .
docker run -d --name biangbiang -p 8080:8080 \
  -v "$PWD/config.xml:/app/config.xml:ro" \
  -v "$PWD/assets:/app/assets:ro" \
  -v "$PWD/data:/app/data" \
  biangbiang
```

### Common operations

```bash
docker compose logs -f          # follow the logs
docker compose restart          # restart (regenerates the PWA icons and app name)
docker compose down             # stop and remove the container
```

### Updating to the latest version

Stable releases are published as tags: fetch the tags, check out the newest
release tag, then rebuild.

```bash
git fetch --tags
git checkout "$(git tag --sort=-v:refname | head -1)"   # the latest release tag
docker compose up -d --build
```

> Checking out a tag leaves you in a detached HEAD state, which makes no
> difference to a deployment. To pin a specific version, replace `"$(...)"` with
> a tag name such as `v1.0.1`.

On the **git development version** (`main`), `git pull` is still what you want:

```bash
git pull
docker compose up -d --build
```

`./config.xml`, `./overwrite.xml`, `./assets` and `./data` are all preserved on
the host through bind mounts, so upgrades never lose them.

---

## Local development

Run the backend and the Vite dev server separately to get hot reloading.

```bash
# terminal 1 — backend (mirrors into ./data, serves the API and files)
cd backend
npm install
CONFIG_PATH=../config.xml DATA_DIR=../data PUBLIC_DIR=../frontend/dist npm start

# terminal 2 — frontend dev server (proxies /api, /dl, /media to :8080)
cd frontend
npm install
npm run dev            # http://localhost:5173
```

Useful scripts:

```bash
cd backend  && npm run mirror   # run one mirror cycle and exit
cd frontend && npm run build    # build the production SPA
cd frontend && npm run type-check
```

> Generating the PWA icons locally requires ImageMagick — see the "PWA" section
> below.

---

## Environment variables

| Variable                | Default                 | Description |
|-------------------------|-------------------------|-------------|
| `PORT`                  | `8080`                  | HTTP port. |
| `HOST`                  | `0.0.0.0`               | Bind address. |
| `TZ`                    | `Asia/Shanghai`         | Container timezone (IANA name). Affects logs and backend-rendered local times. Change it in `docker-compose.yml` / `.env`. |
| `CONFIG_PATH`           | `/app/config.xml`       | Path to `config.xml`. |
| `DATA_DIR`              | `/app/data`             | Directory holding mirrored artifacts and `state.json`. |
| `PUBLIC_DIR`            | `/app/public`           | Built frontend directory. |
| `CHECK_INTERVAL_HOURS`  | `24`                    | How often to poll GitHub for new releases (hours). |
| `MIRROR_ON_START`       | `true`                  | Whether to run a sync immediately on startup. |
| `DOWNLOAD_CONCURRENCY`  | `4`                     | Parallel downloads per project. |
| `GITHUB_TOKEN`          | *(empty)*               | Optional. Raises the API rate limit (60 → 5000 requests/hour). |

All of these can be set in the `environment` block of `docker-compose.yml`.

---

## HTTP API

| Method | Path                                    | Description |
|--------|-----------------------------------------|-------------|
| `GET`  | `/api/state`                            | Current site state: title, favicon, projects, versions, artifacts. |
| `GET`  | `/api/health`                           | Health check (liveness probe). |
| `POST` | `/api/refresh`                          | Trigger a mirror run immediately (used by the "check for updates" button). |
| `GET`  | `/media/{path}`                         | Favicon / project icons, resolved relative to the config directory. |
| `GET`  | `/dl/{owner}/{repo}/{version}/{file}`   | Download a mirrored build artifact. |

> The `{...}` segments above are placeholders — substitute real values in an
> actual request (e.g. `{owner}` becomes the repository owner). Throughout these
> docs, `<...>` is used only for XML tags.

Example `GET /api/state` response:

```json
{
  "title": "Page title",
  "favicon": "/media/assets/favicon.png",
  "lastUpdated": "2026-01-01T12:00:00.000Z",
  "projects": [
    {
      "id": "user/project1",
      "name": "Project 1",
      "icon": "/media/assets/icon1.png",
      "repo": "https://github.com/user/project1",
      "version": "v2.4.0",
      "status": "ok",
      "assets": [
        { "name": "project1-linux-amd64.tar.gz", "size": 1234567,
          "url": "/dl/user/project1/v2.4.0/project1-linux-amd64.tar.gz" }
      ]
    }
  ]
}
```

`status` is one of `ok`, `empty` (no release yet) or `error` (e.g. the
repository does not exist). A project that fails to sync keeps its last
successfully mirrored content.

---

## Notes

### Theme
The theme defaults to **follow system (auto)**, tracking the operating system's
light/dark preference and updating live when the system switches. The control in
the header lets you force **light** or **dark**; the choice is stored in
`localStorage`. Both themes use Ant Design Vue's `defaultAlgorithm` /
`darkAlgorithm` design tokens.

### PWA
The app ships a `manifest.webmanifest` and a minimal service worker, so it can be
installed to the home screen or desktop. That service worker **performs no
caching** — it is a pure network passthrough, so there is no offline mode by
design.

The installable **app icons always follow your `<favicon>`**, and the **app's
name always follows `<title>`**. On every startup the backend derives the whole
icon set from the favicon with ImageMagick:

| Output | Size | Description |
|------|------|------|
| `pwa-192x192.png` | 192×192 | Transparency preserved, padded to a square |
| `pwa-512x512.png` | 512×512 | Transparency preserved, padded to a square |
| `pwa-maskable-512x512.png` | 512×512 | Logo scaled to 80%, background filled with the favicon's average colour |
| `apple-touch-icon.png` | 180×180 | Flattened onto a white background (iOS does not support transparency) |

The icons are written to `{DATA_DIR}/pwa/` and served at the paths declared in
the manifest. On every startup the backend also regenerates
`manifest.webmanifest` in the same directory, replacing its `name` / `short_name`
(the name shown for the installed app) with the `<title>` from `config.xml`;
every other field — description, colours, the icon list — is carried over from
the template that ships with the frontend build. So changing `<favicon>` or
`<title>` and restarting the container updates the installable icons and the app
name. The favicon can be any format ImageMagick can read (PNG, WEBP, …). If
`<favicon>` is not configured, or ImageMagick is unavailable, the bundled default
icons from `frontend/public/` are used instead; if the manifest template cannot
be read, the bundled default manifest is used in the same way.

ImageMagick is already installed in the Docker image. For local development,
install it yourself (`brew install imagemagick`, `apt install imagemagick`, …).

### Rate limits
Unauthenticated GitHub API requests are limited to 60 per hour, which is more
than enough for a handful of projects polled once a day. If you configure many
projects, set `GITHUB_TOKEN` in `docker-compose.yml`.

### Running as a non-root user
The container's entrypoint starts as root, takes ownership of `./data` as the
`node` user (uid 1000), and then immediately drops privileges — so bind mounts
work without any manual `chown`. If you force a different user with `user:` or
`--user`, that user must already be able to write `./data`.

---

## License

This project is released under [The Unlicense](https://unlicense.org) and is in
the public domain. You are free to copy, modify, publish, use, compile, sell, or
distribute this software, in source or compiled binary form, for any purpose,
commercial or non-commercial, and by any means, without attribution.

See the [LICENSE](LICENSE) file in the repository root for the full text.
