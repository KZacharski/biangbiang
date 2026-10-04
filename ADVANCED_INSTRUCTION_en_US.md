# biangbiang — Advanced Deployment Guide (Docker + nginx + HTTPS)

[简体中文](ADVANCED_INSTRUCTION_zh_CN.md) · **English**

This guide takes you from a bare Linux server to a **running, HTTPS-secured
instance of biangbiang** behind an nginx reverse proxy.

If you only want to try the project locally, the short version in
[`README_en_US.md`](README_en_US.md) is enough. This document is the production
path.

---

## Table of contents

1. [What you end up with](#1-what-you-end-up-with)
2. [Requirements](#2-requirements)
3. [Step 1 — Get the code onto the server](#step-1--get-the-code-onto-the-server)
4. [Step 2 — Write `config.xml`](#step-2--write-configxml)
5. [Step 3 — Add your image assets](#step-3--add-your-image-assets)
6. [Step 4 — Start the container](#step-4--start-the-container)
7. [Step 5 — Point your domain at the server](#step-5--point-your-domain-at-the-server)
8. [Step 6 — nginx reverse proxy + TLS](#step-6--nginx-reverse-proxy--tls)
9. [Step 7 — Verify everything](#step-7--verify-everything)
10. [Day-2 operations](#day-2-operations)
11. [Troubleshooting](#troubleshooting)

---

## 1. What you end up with

```
        Internet
            │  https://mirror.example.com
            ▼
    ┌───────────────────┐
    │  nginx (host)     │  TLS termination, port 443
    │  Let's Encrypt    │
    └─────────┬─────────┘
              │  proxy_pass http://127.0.0.1:8080
              ▼
    ┌───────────────────┐
    │  biangbiang       │  single Docker container
    │  Express + SPA    │  (not exposed to the internet)
    └─────────┬─────────┘
              │  every 24 h
              ▼
        GitHub REST API  →  ./data/releases/<owner>/<repo>/<version>/<file>
```

One container serves the API, the mirrored artifacts **and** the built Vue SPA.
State and artifacts live in a bind mount (`./data`), so `docker compose up
--build` never loses data.

---

## 2. Requirements

| Requirement | Notes |
|---|---|
| Linux server | Any distro with Docker. 1 vCPU / 1 GB RAM is plenty to start. |
| Docker Engine | 24 or newer, with the Compose v2 plugin (`docker compose`, not `docker-compose`). |
| Disk space | Sized to your artifacts. biangbiang keeps **only the latest release** of each project, so the footprint stays predictable. |
| A domain | e.g. `mirror.example.com`, with an A/AAAA record you can edit. |
| nginx | On the host (`apt install nginx`) — this guide assumes host nginx. |
| certbot | For free Let's Encrypt certificates. |

> The container itself needs **no** host tooling: Node 22, ImageMagick and all
> dependencies are baked into the image.

---

## Step 1 — Get the code onto the server

```bash
sudo mkdir -p /srv/biangbiang && cd /srv/biangbiang
git clone https://github.com/KZacharski/biangbiang.git .
```

If the server has no outbound Git access, build the image on your workstation
and push it to a registry, then set `image:` in the Compose file instead of
`build:`.

Now lay out the working tree you will actually deploy:

```bash
cp docker-compose.advanced.yml docker-compose.yml
cp .env.example .env
mkdir -p assets data
```

Three paths matter from here on:

| Path | Purpose |
|---|---|
| `config.xml` | Your site configuration (mounted read-only). |
| `overwrite.xml` | Optional. Manual (non-GitHub) projects. Only needed if `config.xml` uses `overwrite@<number>`. |
| `assets/` | Your favicon + project icons (mounted read-only). |
| `data/` | Mirrored artifacts, `state.json`, generated PWA icons. **Back this up.** |

---

## Step 2 — Write `config.xml`

`config.xml` is the **only** thing that decides what the site shows. It is read
from `/app/config.xml` inside the container and is re-parsed on every sync, so
you can edit it and restart without rebuilding the image.

### Minimal example

```xml
<favicon>assets/favicon.png</favicon>
<title>My Mirror</title>

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

### Tag reference

| Tag | Where | Required | Behaviour |
|---|---|---|---|
| `<title>` | root | no | Site title in the header and the browser tab. Falls back to `Releases`. |
| `<favicon>` | root | no | PNG/WEBP used as the site favicon **and** as the source for the installable PWA icons. Falls back to the bundled default icon. |
| `<project>` | root (0..N) | — | One card on the site. Add as many as you like — the layout is fully flexible. |
| `<icon>` | inside `<project>` | no | Card thumbnail (PNG/WEBP). If omitted or broken, the card shows the project's first letter instead. |
| `<name>` | inside `<project>` | no | Display name. Falls back to the repository name. |
| `<repo>` | inside `<project>` | **yes** | GitHub repository. A `<project>` without a valid `<repo>` is silently skipped. |

### Accepted `<repo>` formats

All of these resolve to `owner/repo`:

```text
https://github.com/user/project1
https://github.com/user/project1.git
https://github.com/user/project1/
git@github.com:user/project1.git
user/project1
```

### Rules the mirror applies

- **Only the latest release** of each project is mirrored. Older versions are
  deleted from disk automatically.
- **All assets** attached to that release are mirrored.
- GitHub's auto-generated `Source code (zip)` / `Source code (tar.gz)` archives
  are **never** mirrored.
- Duplicate `<repo>` entries are de-duplicated.
- A broken or misspelled repository does **not** break the site: that card shows
  a "sync failed" alert and keeps the previously mirrored data.

### Path resolution for images

Every image path inside `config.xml` is resolved **relative to the directory
that contains `config.xml`** (i.e. `/app` in the container). Both of these are
valid:

```xml
<icon>assets/icon1.png</icon>
<icon>icon1.png</icon>          <!-- file sitting next to config.xml -->
```

Because `./assets` is mounted read-only at `/app/assets`, the recommended
layout is to keep everything under `assets/`.

### Manual entries — hosting files from anywhere (`overwrite.xml`)

A `<repo>` does not have to be GitHub. Write `overwrite@<number>` and that card
is filled in from `overwrite.xml`, which sits next to `config.xml`:

```xml
<!-- config.xml -->
<project>
    <icon>assets/icon2.webp</icon>
    <name>My project</name>
    <repo>overwrite@1</repo>
</project>
```

```xml
<!-- overwrite.xml -->
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
| `<id>` | Matches the number in `overwrite@<number>`. |
| `<version>` | Version shown on the card, in place of an auto-fetched one. Optional. |
| `<repo>` | URL the "view original repo" button links to. Optional — the button is hidden when omitted. |
| `<downloads>/<file>` | One download button per `<file>`, linking directly to that external URL. |

Behaviour:

- **Lazy loading.** `overwrite.xml` is read only when at least one
  `overwrite@<number>` exists in `config.xml`. A GitHub-only site never opens
  it, so the file may simply be absent.
- **Nothing is downloaded.** Manual entries issue no HTTP requests and write
  nothing to `./data`. The download buttons link straight to your URLs, so
  these entries use no disk space and are not affected by GitHub rate limits.
- **No "released at" date.** There is no release to date, so the card omits it.
  File sizes are likewise unknown and omitted.
- **Mixing is fine.** GitHub projects and manual entries can coexist in any
  combination.
- **Button labels** are the last path segment of each URL
  (`https://cdn.example.com/x/artifact3.zip` → `artifact3.zip`).
- **Missing entries are non-fatal.** An `overwrite@<number>` with no matching
  `<id>`, or a missing `overwrite.xml`, puts only that card into an error state
  and logs one line; every other project is unaffected.

### Mounting `overwrite.xml`

The Compose files mount `config.xml` as a **single file**, so `overwrite.xml`
needs a mount of its own. Both `docker-compose.yml` and
`docker-compose.advanced.yml` already carry it, commented out:

```yaml
      - ./config.xml:/app/config.xml:ro
      - ./assets:/app/assets:ro
      # - ./overwrite.xml:/app/overwrite.xml:ro
      - ./data:/app/data
```

1. Create the file first: `touch /srv/biangbiang/overwrite.xml`, then fill it in.
2. Uncomment the mount line.
3. `docker compose up -d --force-recreate`

> **Order matters.** If you uncomment the mount before the file exists, Docker
> creates an empty *directory* at `./overwrite.xml` on the host and the
> container reads nothing. Remove the directory, create the file, and recreate
> the container.

---

## Step 3 — Add your image assets

biangbiang ships **no** branded artwork. Every image is supplied by you.

### Directory layout

```
/srv/biangbiang/
├── config.xml
├── assets/
│   ├── favicon.png        # site favicon + source for the PWA icons
│   ├── icon1.png          # project 1 thumbnail
│   └── icon2.webp         # project 2 thumbnail
└── data/
```

### 1. Favicon (required for a custom look)

```bash
# Drop your logo in place, then reference it in config.xml:
#   <favicon>assets/favicon.png</favicon>
cp ~/my-logo.png /srv/biangbiang/assets/favicon.png
```

- **Format:** anything ImageMagick can read — PNG and WEBP are the tested paths.
- **Size:** 512×512 or larger, ideally square with transparency.
- At every container start the backend derives the whole installable icon set
  from this file:

  | Generated file | Size | Purpose |
  |---|---|---|
  | `pwa-192x192.png` | 192×192 | PWA icon, transparency preserved |
  | `pwa-512x512.png` | 512×512 | PWA icon, transparency preserved |
  | `pwa-maskable-512x512.png` | 512×512 | Android adaptive icon, logo scaled to 80 % on an average-colour background |
  | `apple-touch-icon.png` | 180×180 | iOS home screen (flattened onto white) |

  They are written to `data/pwa/` and served by the backend — you never commit
  them.

### 2. Project icons

Copy one image per project and reference it with `<icon>`:

```bash
cp ~/project1-logo.png   /srv/biangbiang/assets/icon1.png
cp ~/project2-logo.webp  /srv/biangbiang/assets/icon2.webp
```

- Rendered at **48×48 px** with `object-fit: cover`, so a square source image
  looks best.
- Optional. Without an `<icon>`, the card shows the project's first letter in a
  tinted square.

### 3. Apply the changes

Assets are mounted read-only, so the container sees them immediately — but the
**PWA icons are only regenerated at startup**:

```bash
cd /srv/biangbiang
docker compose restart biangbiang
```

> **Permissions.** The container runs as uid/gid **1000** (`node`). Files under
> `assets/` only need to be world-readable (`chmod 644`), which is the default
> for copied files. `data/` must be **writable** by uid 1000 — see
> [Day-2 operations](#day-2-operations).

---

## Step 4 — Start the container

Edit `.env` (created in Step 1):

```ini
# Optional. Fine-grained PAT with read-only "Public repositories" access.
# Lifts the GitHub API limit from 60 to 5000 requests/hour.
GITHUB_TOKEN=github_pat_xxxxxxxxxxxxxxxxxxxx

# Timestamps rendered by the site. Any IANA zone name works.
TZ=Asia/Shanghai
```

Then build and start:

```bash
cd /srv/biangbiang
docker compose up -d --build
docker compose logs -f
```

You should see:

```text
[server] listening on http://0.0.0.0:8080
[server] config: /app/config.xml
[server] data:   /app/data
[server] timezone: Asia/Shanghai
[server] check interval: 24h
[pwa] generated app icons from /app/assets/favicon.png
[mirror] user/project1: downloading project1-linux-amd64.tar.gz
...
[mirror] cycle complete: 2 project(s) at 2026-01-01T12:00:00.000Z
```

Confirm the container is healthy and **only** reachable on loopback:

```bash
docker compose ps
curl -s http://127.0.0.1:8080/api/health
# {"status":"ok","time":"..."}
```

### Environment variables

All of these are set in the `environment:` block of the Compose file.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP port inside the container. |
| `HOST` | `0.0.0.0` | Bind address. |
| `TZ` | `Asia/Shanghai` | Container timezone (IANA name). Affects logs and backend-rendered local times. Override it in `docker-compose.yml` or `.env`. |
| `CONFIG_PATH` | `/app/config.xml` | Location of `config.xml`. |
| `DATA_DIR` | `/app/data` | Mirrored artifacts + `state.json` + generated PWA icons. |
| `PUBLIC_DIR` | `/app/public` | Built SPA (baked into the image). |
| `CHECK_INTERVAL_HOURS` | `24` | Poll interval; minimum `0.05` (3 minutes). |
| `MIRROR_ON_START` | `true` | Set to `false` to skip the initial sync on boot. |
| `DOWNLOAD_CONCURRENCY` | `4` | Parallel asset downloads per project. |
| `GITHUB_TOKEN` | *(empty)* | Optional. Raises the API rate limit. |

---

## Step 5 — Point your domain at the server

Create a DNS **A record** (and an `AAAA` record if the server has IPv6):

```text
Type   Name              Value              TTL
A      mirror            203.0.113.10       300
```

Verify propagation before continuing — certbot will fail otherwise:

```bash
dig +short mirror.example.com
# 203.0.113.10
```

> Use a **dedicated subdomain**. biangbiang serves its SPA at the site root
> (`start_url: "/"`), so hosting it under a sub-path such as
> `example.com/mirror` is not supported.

---

## Step 6 — nginx reverse proxy + TLS

### 1. Install nginx and certbot

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 2. Create the site config

`/etc/nginx/sites-available/biangbiang`:

```nginx
# --- ACME challenge + HTTP -> HTTPS redirect -------------------------------
server {
    listen 80;
    listen [::]:80;
    server_name mirror.example.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/biangbiang /etc/nginx/sites-enabled/biangbiang
sudo mkdir -p /var/www/html
sudo nginx -t && sudo systemctl reload nginx
```

### 3. Obtain the certificate

```bash
sudo certbot certonly --webroot -w /var/www/html \
  -d mirror.example.com \
  --agree-tos -m you@example.com --no-eff-email
```

Certbot installs a systemd timer that renews automatically.

### 4. Add the HTTPS server block

Now replace the config with the full version — it keeps the ACME/redirect block
from above and adds TLS + proxying:

```nginx
# --- ACME challenge + HTTP -> HTTPS redirect -------------------------------
server {
    listen 80;
    listen [::]:80;
    server_name mirror.example.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# --- HTTPS -----------------------------------------------------------------
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name mirror.example.com;

    ssl_certificate     /etc/letsencrypt/live/mirror.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mirror.example.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Release artifacts can be hundreds of MB: stream them straight through
    # instead of buffering the whole file in nginx first.
    proxy_buffering off;
    proxy_request_buffering off;
    client_max_body_size 0;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;

        # Downloads of large files must not be cut off mid-transfer.
        proxy_connect_timeout 30s;
        proxy_send_timeout    3600s;
        proxy_read_timeout    3600s;
    }
}
```

Apply it:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

> **Why loopback only?** The Compose file publishes
> `127.0.0.1:8080:8080`. The container is therefore unreachable from the
> internet, and all public traffic is forced through nginx, which terminates
> TLS. If you would rather skip nginx and expose the port directly, change the
> `ports:` entry to `"8080:8080"` — but then you have no HTTPS and the PWA will
> not be installable.

### Alternative: nginx as a container

If you prefer to keep everything in Compose, add an nginx service on the same
network and drop the `ports:` mapping from the `biangbiang` service, then
`proxy_pass http://biangbiang:8080;`. Mount your certs and `nginx.conf` as
volumes. The host-nginx setup above is simpler to renew certificates with, so
it is the recommended path.

---

## Step 7 — Verify everything

```bash
# 1. DNS resolves to your server
dig +short mirror.example.com

# 2. TLS works and redirects from HTTP
curl -sI http://mirror.example.com | head -1      # 301 -> https://
curl -sI https://mirror.example.com | head -1     # 200

# 3. The API answers through the proxy
curl -s https://mirror.example.com/api/health

# 4. The container never leaks onto the public interface
ss -tlnp | grep 8080        # must show 127.0.0.1:8080, never 0.0.0.0:8080

# 5. A mirrored artifact downloads
curl -sI "https://mirror.example.com/dl/<owner>/<repo>/<version>/<file>" | head -1
```

Then open `https://mirror.example.com` in a browser:

- The header shows your `<title>` and favicon.
- One card per `<project>`, each with the version tag and one button per asset.
- "查看原仓库" (view original repo) links back to GitHub.
- The theme switcher offers 跟随系统 / 浅色 / 深色 (system / light / dark).

### Installing as a PWA

Because the site is now served over HTTPS, the service worker registers and the
app is installable:

- **iOS Safari:** Share → *Add to Home Screen*.
- **Android Chrome:** menu → *Install app*.
- **Desktop Chrome/Edge:** the install icon in the address bar.

The app is deliberately **not** offline-capable — the service worker is a pure
network passthrough.

---

## Day-2 operations

### Logs

```bash
docker compose logs -f --tail=100 biangbiang
```

### Trigger a sync immediately

The "立即检查更新" (check for updates now) button on the site calls
`POST /api/refresh`. From the shell:

```bash
curl -X POST https://mirror.example.com/api/refresh
```

### Update biangbiang

```bash
cd /srv/biangbiang
git pull
docker compose up -d --build
```

`./config.xml`, `./assets` and `./data` live on the host, so upgrades never
touch them.

### Back up

The only irreplaceable data is the configuration and the mirrored files:

```bash
tar czf biangbiang-$(date +%F).tar.gz config.xml assets data
```

`data/state.json` makes the site render instantly after a restore, before the
first GitHub poll finishes.

### File ownership

The image runs as uid/gid **1000** (`node`). On Linux hosts a freshly created
`./data` may be owned by `root` (if you ran `sudo mkdir`), which makes the
mirror fail with `EACCES`:

```bash
sudo chown -R 1000:1000 /srv/biangbiang/data
```

If you cannot change ownership, uncomment `user: "1000:1000"` in the Compose
file and match it to whoever owns `./data`.

### GitHub rate limits

Unauthenticated requests are capped at **60/hour per IP**. A handful of
projects polled once a day is fine. For many projects, create a
[fine-grained token](https://github.com/settings/tokens?type=beta) with
read-only access to public repositories, put it in `.env` as `GITHUB_TOKEN`, and
restart:

```bash
docker compose up -d --force-recreate
```

### Changing the poll interval

Set `CHECK_INTERVAL_HOURS` in the Compose `environment:` block (minimum `0.05`,
i.e. 3 minutes) and recreate the container.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `503 Frontend build not found.` | `PUBLIC_DIR` doesn't contain `index.html`. Don't override `PUBLIC_DIR`; the SPA is baked into the image at `/app/public`. |
| Every card says "同步失败" with `404 Not Found` | The `<repo>` doesn't exist or is misspelled — or the token lacks access to a private repo. |
| `overwrite.xml not found at /app/overwrite.xml` in the logs | A project uses `overwrite@<number>` but the file isn't mounted. Create `./overwrite.xml` and uncomment its volume line — see [Mounting `overwrite.xml`](#mounting-overwritexml). |
| One card says `overwrite.xml has no <overwrite> block with <id>N</id>` | The number in `overwrite@N` has no matching `<id>N</id>`. Check both files, or add the missing block. |
| `EISDIR` / "is a directory" for `overwrite.xml` | The mount was enabled before the file existed, so Docker created a directory. `rmdir ./overwrite.xml`, create the file, recreate the container. |
| Manual download button 404s | The `<file>` URL is wrong or no longer reachable — the button links straight to it, so it is never validated by biangbiang. |
| `API rate limit exceeded` | Set `GITHUB_TOKEN` in `.env`. |
| Card shows no icon | `<icon>` path is wrong, or the file isn't readable by uid 1000. Paths resolve relative to `config.xml`. |
| PWA icon is still the default | `<favicon>` is missing/unreadable, or ImageMagick failed. Check `docker compose logs \| grep '\[pwa\]'`, then `docker compose restart biangbiang`. |
| `EACCES` / `permission denied` on `./data` | `sudo chown -R 1000:1000 ./data`. |
| Site works on `http://127.0.0.1:8080` but not through the domain | nginx `proxy_pass` target, `server_name`, or the firewall (ports 80/443 must be open). |
| Download stops partway | Raise `proxy_read_timeout` / `proxy_send_timeout` in the nginx block. |
| Service worker never registers | The site must be served over **HTTPS** (or `localhost`). Plain-HTTP on an IP address is not a secure context. |
| certbot fails with a challenge error | DNS not propagated, port 80 blocked, or another server block already claims the `server_name`. |
| Old files filling the disk | Only the latest version per project is kept. Check for other data in `./data`; consider `DOWNLOAD_CONCURRENCY` tuning and a larger volume. |

### Useful one-liners

```bash
docker compose ps                                   # health status
docker inspect --format '{{.State.Health.Status}}' biangbiang
docker compose exec biangbiang node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>r.text()).then(console.log)"
curl -s http://127.0.0.1:8080/api/state | head -c 400
du -sh /srv/biangbiang/data
```
