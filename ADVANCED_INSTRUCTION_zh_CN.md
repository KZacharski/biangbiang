# biangbiang —— 进阶部署指南（Docker + nginx + HTTPS）

**简体中文** · [English](ADVANCED_INSTRUCTION_en_US.md)

本指南将带你从一台全新的 Linux 服务器，一步步走到**通过 nginx 反向代理对外提供 HTTPS 服务的 biangbiang 实例**。

如果你只是想在本地试用，[`README.md`](README.md) 中的简要步骤就够了。本文档面向生产部署。

---

## 目录

1. [最终架构](#1-最终架构)
2. [环境要求](#2-环境要求)
3. [第一步 —— 把代码放到服务器上](#第一步--把代码放到服务器上)
4. [第二步 —— 编写 config.xml](#第二步--编写-configxml)
5. [第三步 —— 添加图片素材](#第三步--添加图片素材)
6. [第四步 —— 启动容器](#第四步--启动容器)
7. [第五步 —— 把域名指向服务器](#第五步--把域名指向服务器)
8. [第六步 —— nginx 反向代理 + TLS](#第六步--nginx-反向代理--tls)
9. [第七步 —— 验证部署](#第七步--验证部署)
10. [日常运维](#日常运维)
11. [故障排查](#故障排查)

---

## 1. 最终架构

```
        互联网
            │  https://mirror.example.com
            ▼
    ┌───────────────────┐
    │  nginx（宿主机）  │  TLS 终止，监听 443
    │  Let's Encrypt    │
    └─────────┬─────────┘
              │  proxy_pass http://127.0.0.1:8080
              ▼
    ┌───────────────────┐
    │  biangbiang       │  单个 Docker 容器
    │  Express + SPA    │  （不直接暴露到公网）
    └─────────┬─────────┘
              │  每 24 小时
              ▼
        GitHub REST API  →  ./data/releases/<owner>/<repo>/<version>/<file>
```

一个容器同时提供 API、镜像后的构建产物**以及**打包好的 Vue 单页应用。数据与产物都存放在 bind mount（`./data`）中，因此执行 `docker compose up --build` 不会丢失任何数据。

---

## 2. 环境要求

| 项目 | 说明 |
|---|---|
| Linux 服务器 | 任何支持 Docker 的发行版。起步阶段 1 核 / 1 GB 内存完全够用。 |
| Docker Engine | 24 或更高版本，并带 Compose v2 插件（命令是 `docker compose`，不是 `docker-compose`）。 |
| 磁盘空间 | 按构建产物大小规划。biangbiang **每个项目只保留最新版本**，所以占用是可预期的。 |
| 一个域名 | 例如 `mirror.example.com`，且你能修改它的解析记录。 |
| nginx | 安装在宿主机上（`apt install nginx`）——本文以宿主机 nginx 为例。 |
| certbot | 用于申请免费的 Let's Encrypt 证书。 |

> 容器本身**不依赖**宿主机上的任何工具：Node 22、ImageMagick 以及全部依赖都已打包进镜像。

---

## 第一步 —— 把代码放到服务器上

克隆最新的稳定版（`v1.0.1` 标签）：

```bash
sudo mkdir -p /srv/biangbiang
sudo chown "$USER":"$USER" /srv/biangbiang
cd /srv/biangbiang
git clone --branch v1.0.1 https://github.com/xiaomianguan/biangbiang.git .
```

想改用 **git 开发版**（跟踪 `main` 分支）？去掉 `--branch` 参数即可。开发版包含最新的改动，但尚未作为正式版本发布，可能不稳定：

```bash
cd /srv/biangbiang
git clone https://github.com/xiaomianguan/biangbiang.git .
```

> **`chown` 这一步不能省。** `sudo mkdir` 建出来的目录属主是 `root`，之后在它里面创建的所有东西（包括 `./data`）都会继承这个属主。容器是以非特权用户运行的，属主为 `root` 的 `./data` 会让镜像任务在第一次写入时就报 `EACCES`。

如果服务器无法访问外网 Git，可以在本地构建镜像并推送到镜像仓库，然后把 Compose 文件中的 `build:` 换成 `image:`。

接着准备实际部署用的目录结构：

```bash
cp docker-compose.advanced.yml docker-compose.yml
cp .env.example .env
mkdir -p data            # config.xml、overwrite.xml 与 assets/ 随仓库提供，这里只需 data/
```

> `./data` 由容器写入。容器启动时会自动修正它的属主（见[文件属主](#文件属主)），因此无需手动 `chown`。

从这里开始，只有四个路径需要你关心：

| 路径 | 用途 |
|---|---|
| `config.xml` | 站点配置（以只读方式挂载进容器）。 |
| `overwrite.xml` | 手动条目（非 GitHub 项目），只读挂载。仅当 `config.xml` 里用到 `overwrite@<数字>` 时才会被读取。 |
| `assets/` | 你的 favicon 与各项目图标（只读挂载）。 |
| `data/` | 镜像产物、`state.json`、生成的 PWA 图标与 manifest。**请务必备份。** |

---

## 第二步 —— 编写 config.xml

`config.xml` 是**唯一**决定站点展示内容的文件。容器从 `/app/config.xml` 读取它，每次同步都会重新解析，因此改完配置后重启容器即可，无需重新构建镜像。

仓库**已经自带一份可直接使用的 `config.xml`**，与之配套的 `overwrite.xml` 和 `assets/` 也一并提供，因此本步骤同样可以跳过——原样部署即可看到一个完整站点。下面的「最小示例」讲的是如何按自己的需求改写它。

> **自带的样例里有两张「故意失败」的卡片。** 它分别用 `https://github.com/user/project2`（不存在的仓库）和 `overwrite@2`（`overwrite.xml` 中没有对应 `<id>`）演示两种错误状态，用来展示站点在仓库写错或手动条目缺失时的表现——这是预期行为，不是 bug。删掉它们，或改成你自己的项目即可。

### 最小示例

```xml
<favicon>assets/favicon.png</favicon>
<title>我的镜像站</title>
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

### 标签说明

| 标签 | 位置 | 是否必填 | 行为 |
|---|---|---|---|
| `<title>` | 根节点 | 否 | 页头、浏览器标签页以及**安装后的应用名**显示的站点标题。缺省时回退为 `Releases`。 |
| `<favicon>` | 根节点 | 否 | 用作站点 favicon 的 PNG/WEBP，**同时**是可安装 PWA 图标的生成源。缺省时使用内置的默认图标。 |
| `<sortable>` | 根节点 | 否 | 只接受 `true` / `false`（大小写不敏感）。设为 `true` 时页头会出现排序下拉框，访客可按「按名称 / 最近更新 / 文件最多 / 文件最少」重新排列卡片，默认按名称（字母顺序）；`false`、写错或省略时，卡片严格保持 `<project>` 的书写顺序。 |
| `<accent>` | 根节点 | 否 | Ant Design [基础色板](https://ant.design/docs/spec/colors) 的色名，取 `red` / `volcano` / `orange` / `gold` / `yellow` / `lime` / `green` / `cyan` / `blue` / `geekblue` / `purple` / `magenta` 之一（大小写不敏感）。用该色替换站点默认的品牌蓝（Daybreak Blue）。省略、留空或写成无法识别的值时一律回退为默认蓝色——不会报错，也不会让站点失去配色。 |
| `<font>` | 根节点 | 否 | 字体文件路径（如 `assets/MyFont.woff2`），与 `<favicon>` 一样**相对于 `config.xml` 所在目录**解析。站点整体——包括 Ant Design 的按钮、标签、下拉框等组件——都会改用该字体，缺字形的字符仍由系统字体补足。省略、留空或文件不存在时保持系统默认字体。 |
| `<project>` | 根节点（0..N） | — | 对应站点上的一张卡片。数量不限，自动按屏幕宽度排成 1 / 2 / 3 列，且每张卡片各自独立高度——不会被拉伸去补齐同行最高的卡片。较矮的卡片还会上浮填满下方的空位，卡片间距恒为 16px——Safari 26.4+ 走原生 Grid Lanes，其他浏览器由前端自行排版。 |
| `<icon>` | `<project>` 内 | 否 | 卡片缩略图（PNG/WEBP）。缺省或图片加载失败时，卡片会显示项目名称的首字母。 |
| `<name>` | `<project>` 内 | 否 | 显示名称。缺省时回退为仓库名。 |
| `<repo>` | `<project>` 内 | **是** | GitHub 仓库地址。`<repo>` 无效的 `<project>` 会被静默跳过。 |

### `<repo>` 支持的写法

以下写法都会被解析为 `owner/repo`：

```text
https://github.com/user/project1
https://github.com/user/project1.git
https://github.com/user/project1/
git@github.com:user/project1.git
user/project1
```

### 镜像规则

- 每个项目**只镜像最新的 Release**，旧版本会自动从磁盘删除。
- 该 Release 中附带的**全部构建产物**都会被镜像。
- GitHub 自动生成的 `Source code (zip)` / `Source code (tar.gz)` 归档**永远不会**被镜像。
- 重复的 `<repo>` 条目会自动去重。
- 某个仓库写错或已删除**不会**拖垮整个站点：该卡片会显示「同步失败」提示，并保留上一次成功镜像的数据。

### 图片路径的解析规则

`config.xml` 中的所有图片路径都**相对于 `config.xml` 所在的目录**（即容器内的 `/app`）解析。下面两种写法都有效：

```xml
<icon>assets/icon1.png</icon>
<icon>icon1.png</icon>          <!-- 与 config.xml 放在同一目录 -->
```

由于 `./assets` 以只读方式挂载到 `/app/assets`，推荐把所有图片统一放在 `assets/` 下。

### 手动条目 —— 把任意位置的文件托管到站点上（overwrite.xml）

`<repo>` 不一定要写 GitHub。写成 `overwrite@<数字>` 时，这张卡片的数据就改由与 `config.xml` 同目录的 `overwrite.xml` 提供：

```xml
<!-- config.xml -->
<project>
    <icon>assets/icon2.webp</icon>
    <name>我的项目</name>
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

| 标签 | 说明 |
|---|---|
| `<id>` | 与 `overwrite@<数字>` 中的数字对应。 |
| `<version>` | 卡片上显示的版本号，代替自动获取的版本。可省略。 |
| `<repo>` | 「查看原仓库」按钮指向的地址。可省略，省略时该按钮不显示。 |
| `<downloads>/<file>` | 每个 `<file>` 对应一个下载按钮，直接指向该外部链接。 |

行为说明：

- **按需读取。** 只有当 `config.xml` 中至少存在一个 `overwrite@<数字>` 时才会读取 `overwrite.xml`；纯 GitHub 站点根本不会打开它，所以这个文件可以不存在。
- **不下载任何东西。** 手动条目不会发起任何 HTTP 请求，也不会往 `./data` 写任何文件。下载按钮直接指向你填写的 URL，因此不占磁盘、也不受 GitHub 速率限制影响。
- **不显示「发布于」日期。** 没有 Release，自然没有发布日期；文件大小同样未知，因此也不显示。
- **可以随意混用。** GitHub 项目与手动条目能以任意组合共存。
- **按钮上的文件名**取自链接 URL 的最后一段（`https://cdn.example.com/x/artifact3.zip` → `artifact3.zip`）。
- **条目缺失不会拖垮站点。** 如果 `overwrite@<数字>` 找不到对应的 `<id>`，或者 `overwrite.xml` 整个不存在，只有那一张卡片会进入错误状态并输出一行日志，其他项目不受影响。

### 挂载 overwrite.xml

`overwrite.xml` 与 `config.xml` 一样，由 `docker-compose.yml` 和 `docker-compose.advanced.yml` 以**单个文件**的方式挂载：

```yaml
      - ./config.xml:/app/config.xml:ro
      - ./overwrite.xml:/app/overwrite.xml:ro
      - ./assets:/app/assets:ro
      - ./data:/app/data
```

每一轮镜像检查都会重新读取这个文件，所以改完宿主机上的内容后，点一下界面上的「立即检查更新」，或等下一次定时检查即可生效，**不需要**重新构建或重启容器。

> **请保持文件存在。** 如果 `./overwrite.xml` 不存在，Docker 会把它建成一个空**目录**，所有 `overwrite@<数字>` 卡片都会以 `EISDIR` 报错。仓库里已经自带一份可直接使用的样例，新克隆的仓库不会遇到这个问题；若你删掉了它，用 `touch /srv/biangbiang/overwrite.xml` 重新建一个即可。

---

## 第三步 —— 添加图片素材

仓库**自带一套可用的样例素材**：`assets/` 中的 favicon、项目图标，以及一份随附字体。配合自带的 `config.xml`，新克隆的仓库开箱就是一个外观完整的站点，无需先准备任何图片。下面讲的是如何把它们换成你自己的——可以逐个替换，也可以把样例全部删掉、从零开始。站点外观完全由 `assets/` 与 `config.xml` 决定；biangbiang 本身不内置任何固定的品牌素材。

### 目录结构

```
/srv/biangbiang/
├── config.xml
├── assets/
│   ├── favicon.png        # 站点 favicon，同时是 PWA 图标的生成源
│   ├── icon1.png          # 项目 1 的缩略图
│   └── icon2.webp         # 项目 2 的缩略图
└── data/
```

> 除 `data/` 外，以上文件都**已经随仓库提供**，所以下面的 `cp` 命令是「替换」而不是「创建」——只有当你想要自己的外观时才需要执行。

### 1. favicon（想要自定义外观就必填）

```bash
# 把你的 logo 放进去，并在 config.xml 中引用：
#   <favicon>assets/favicon.png</favicon>
cp ~/my-logo.png /srv/biangbiang/assets/favicon.png
```

- **格式：** ImageMagick 能读取的任意格式，PNG 与 WEBP 是经过验证的路径。
- **尺寸：** 建议 512×512 或更大，最好是带透明通道的正方形。
- 每次容器启动时，后端都会由这个文件派生出整套可安装图标：

  | 生成的文件 | 尺寸 | 用途 |
  |---|---|---|
  | `pwa-192x192.png` | 192×192 | PWA 图标，保留透明度 |
  | `pwa-512x512.png` | 512×512 | PWA 图标，保留透明度 |
  | `pwa-maskable-512x512.png` | 512×512 | Android 自适应图标，图案缩放到 80%，背景填充为图片的平均色 |
  | `apple-touch-icon.png` | 180×180 | iOS 主屏幕图标（平铺到白色背景） |

  它们会被写入 `data/pwa/` 并由后端对外提供，**不需要**提交到仓库。同一目录下的 `manifest.webmanifest` 同样是每次启动时由 `<title>` 重新生成的——其中的 `name` / `short_name` 就是安装后显示的应用名，其余字段沿用前端构建产物中的模板。

### 2. 项目图标

为每个项目复制一张图片，并用 `<icon>` 引用：

```bash
cp ~/project1-logo.png   /srv/biangbiang/assets/icon1.png
cp ~/project2-logo.webp  /srv/biangbiang/assets/icon2.webp
```

- 渲染尺寸为 **48×48 px**，使用 `object-fit: cover`，因此正方形原图效果最好。
- 该标签可选。不写 `<icon>` 时，卡片会显示项目名称首字母的色块。

### 3. 让改动生效

素材是只读挂载的，容器会立刻看到新文件——但 **PWA 图标与应用名只在启动时重新生成**：

```bash
cd /srv/biangbiang
docker compose restart biangbiang
```

> **权限说明。** 容器以 uid/gid **1000**（`node`）运行。`assets/` 下的文件只需要全局可读（`chmod 644`，这也是复制文件的默认权限）。而 `data/` 必须对 uid 1000 **可写**，详见[日常运维](#日常运维)。

---

## 第四步 —— 启动容器

编辑第一步创建的 `.env`：

```ini
# 可选。需要细粒度的 PAT，勾选「公开仓库」只读权限。
# 可把 GitHub API 限额从 60 次/小时提升到 5000 次/小时。
GITHUB_TOKEN=github_pat_xxxxxxxxxxxxxxxxxxxx

# 站点渲染时间戳所用的时区。
TZ=Asia/Shanghai
```

然后构建并启动：

```bash
cd /srv/biangbiang
docker compose up -d --build
docker compose logs -f
```

正常会看到类似输出：

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

确认容器健康，并且**只能**通过回环地址访问：

```bash
docker compose ps
curl -s http://127.0.0.1:8080/api/health
# {"status":"ok","time":"..."}
```

### 环境变量

以下变量都在 Compose 文件的 `environment:` 段落中设置。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `8080` | 容器内的 HTTP 端口。 |
| `HOST` | `0.0.0.0` | 监听地址。 |
| `TZ` | `Asia/Shanghai` | 容器时区（IANA 名称）。影响日志与后端渲染的本地时间。可在 `docker-compose.yml` 或 `.env` 中修改。 |
| `CONFIG_PATH` | `/app/config.xml` | `config.xml` 的位置。 |
| `DATA_DIR` | `/app/data` | 镜像产物 + `state.json` + 生成的 PWA 图标与 manifest。 |
| `PUBLIC_DIR` | `/app/public` | 打包好的 SPA（已固化在镜像中）。 |
| `CHECK_INTERVAL_HOURS` | `24` | 轮询间隔，最小 `0.05`（3 分钟）。 |
| `MIRROR_ON_START` | `true` | 设为 `false` 可跳过启动时的首次同步。 |
| `DOWNLOAD_CONCURRENCY` | `4` | 每个项目并发下载的数量。 |
| `GITHUB_TOKEN` | *（空）* | 可选。用于提升 API 限额。 |

---

## 第五步 —— 把域名指向服务器

添加一条 DNS **A 记录**（若服务器有 IPv6，再添加一条 `AAAA` 记录）：

```text
类型   名称              值                  TTL
A      mirror            203.0.113.10       300
```

继续之前先确认解析已生效，否则 certbot 会失败：

```bash
dig +short mirror.example.com
# 203.0.113.10
```

> 请使用**独立子域名**。biangbiang 的 SPA 位于站点根路径（`start_url: "/"`），因此不支持部署在 `example.com/mirror` 这样的子路径下。

---

## 第六步 —— nginx 反向代理 + TLS

### 1. 安装 nginx 与 certbot

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 2. 创建站点配置

`/etc/nginx/sites-available/biangbiang`：

```nginx
# --- ACME 校验 + HTTP 跳转 HTTPS ------------------------------------------
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

启用它：

```bash
sudo ln -s /etc/nginx/sites-available/biangbiang /etc/nginx/sites-enabled/biangbiang
sudo mkdir -p /var/www/html
sudo nginx -t && sudo systemctl reload nginx
```

### 3. 申请证书

```bash
sudo certbot certonly --webroot -w /var/www/html \
  -d mirror.example.com \
  --agree-tos -m you@example.com --no-eff-email
```

certbot 会安装一个 systemd timer，之后会自动续期。

### 4. 补上 HTTPS server 段

现在把配置替换为完整版本——它保留了上面的 ACME / 跳转段，并新增了 TLS 与反向代理：

```nginx
# --- ACME 校验 + HTTP 跳转 HTTPS ------------------------------------------
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

# --- HTTPS ----------------------------------------------------------------
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

    # 构建产物可能有几百 MB：直接透传，不要先整个缓存进 nginx。
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

        # 下载大文件不能被中途掐断。
        proxy_connect_timeout 30s;
        proxy_send_timeout    3600s;
        proxy_read_timeout    3600s;
    }
}
```

应用配置：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

> **为什么只绑定回环地址？** Compose 文件发布的是 `127.0.0.1:8080:8080`，因此容器无法从公网直接访问，所有公网流量都被强制经由 nginx，由 nginx 负责 TLS 终止。若你不想用 nginx、想让端口直接对外，把 `ports:` 改成 `"8080:8080"` 即可——但那样就没有 HTTPS，PWA 也无法安装。

### 备选方案：把 nginx 也放进容器

如果你希望所有东西都由 Compose 管理，可以在同一个网络里再加一个 nginx 服务，去掉 `biangbiang` 服务的 `ports:` 映射，并把 `proxy_pass` 改成 `http://biangbiang:8080;`，同时把证书和 `nginx.conf` 挂载进去。上面基于宿主机 nginx 的方案在证书续期上更省事，因此是推荐做法。

---

## 第七步 —— 验证部署

```bash
# 1. DNS 已解析到你的服务器
dig +short mirror.example.com

# 2. TLS 正常，且 HTTP 会跳转
curl -sI http://mirror.example.com | head -1      # 301 -> https://
curl -sI https://mirror.example.com | head -1     # 200

# 3. API 可以透过代理访问
curl -s https://mirror.example.com/api/health

# 4. 容器没有暴露到公网网卡
ss -tlnp | grep 8080        # 必须显示 127.0.0.1:8080，绝不能是 0.0.0.0:8080

# 5. 镜像产物可以下载
curl -sI "https://mirror.example.com/dl/<owner>/<repo>/<version>/<file>" | head -1
```

然后用浏览器打开 `https://mirror.example.com`，检查：

- 页头显示你在 `<title>` 中配置的标题与 favicon。
- 每个 `<project>` 对应一张卡片，卡片上有版本标签和每个产物的下载按钮。
- 「查看原仓库」按钮会跳回 GitHub。
- 主题切换器提供「跟随系统 / 浅色 / 深色」三档。
- 若设置了 `<sortable>true</sortable>`，页头会出现排序下拉框（按名称 / 最近更新 / 文件最多 / 文件最少）。
- 若设置了 `<accent>`（如 `<accent>volcano</accent>`），版本标签、「查看原仓库」链接等原本为蓝色的元素会变成该颜色；未设置时保持默认蓝色。
- 若设置了 `<font>`（如 `<font>assets/MyFont.woff2</font>`），页面所有文字——含按钮、标签、下拉框等 Ant Design 组件——都会改用该字体；未设置或文件不存在时保持系统默认字体。
- 页面已禁用双指缩放，整体不再能放大缩小，滚动与左右/上下滑动不受影响；浏览器菜单或系统辅助功能里的缩放仍然可用。

### 安装为 PWA

由于站点现在通过 HTTPS 提供，Service Worker 可以注册，应用也就可以安装：

- **iOS Safari：** 分享 → *添加到主屏幕*。
- **Android Chrome：** 菜单 → *安装应用*。
- **桌面版 Chrome / Edge：** 地址栏右侧的安装图标。

应用按设计**不提供离线能力**——Service Worker 只是纯网络透传。

---

## 日常运维

### 查看日志

```bash
docker compose logs -f --tail=100 biangbiang
```

### 立即触发一次同步

页面上的「立即检查更新」按钮实际调用的是 `POST /api/refresh`。在命令行里也可以：

```bash
curl -X POST https://mirror.example.com/api/refresh
```

### 升级 biangbiang

稳定版以标签形式发布：先取回标签，再切到目标版本（把 `v1.0.1` 换成新版本号），最后重建容器。检出标签后处于 detached HEAD 状态，这对部署没有影响。

```bash
cd /srv/biangbiang
git fetch --tags
git checkout v1.0.1
docker compose up -d --build
```

如果部署的是 **git 开发版**（`main` 分支），改用 `git pull` 即可：

```bash
cd /srv/biangbiang
git pull
docker compose up -d --build
```

`./config.xml`、`./assets` 与 `./data` 都保存在宿主机上，升级不会影响它们。

### 备份

真正不可替代的只有配置与镜像下来的文件：

```bash
tar czf biangbiang-$(date +%F).tar.gz config.xml assets data
```

`data/state.json` 能让站点在恢复后立即渲染出来，而不必等第一次 GitHub 轮询完成。

### 文件属主

容器以 uid/gid **1000**（`node`）运行。bind mount 进来的 `./data` 会保留宿主机上的属主——如果是用 `sudo` 建的目录，属主就是 `root`——而非特权进程无法写入这样的目录。

这一步由 entrypoint 自动完成：容器以 root 启动时，会先把 `DATA_DIR` 的属主改成 `node`，然后再降权运行。所以默认的 Compose 配置不需要任何手动 `chown`。

如果容器根本不以 root 启动，entrypoint 就无能为力了。当你在 Compose 里设置了 `user:`，或用 `--user` 运行 `docker run` 时，`./data` 必须已经对该 uid 可写：

```bash
sudo chown -R 1000:1000 /srv/biangbiang/data
```

### GitHub 速率限制

未认证请求限制为**每小时 60 次**（按 IP 计）。少量项目、每天轮询一次完全够用。如果项目很多，请创建一个[细粒度令牌](https://github.com/settings/tokens?type=beta)（只读公开仓库权限），写进 `.env` 的 `GITHUB_TOKEN`，然后重启：

```bash
docker compose up -d --force-recreate
```

### 修改轮询间隔

在 Compose 的 `environment:` 段落中设置 `CHECK_INTERVAL_HOURS`（最小 `0.05`，即 3 分钟），然后重建容器。

---

## 故障排查

| 现象 | 原因 / 解决办法 |
|---|---|
| 返回 `503 Frontend build not found.` | `PUBLIC_DIR` 下没有 `index.html`。不要覆盖 `PUBLIC_DIR`，SPA 已固化在镜像的 `/app/public`。 |
| 所有卡片都显示「同步失败」且错误为 `404 Not Found` | `<repo>` 不存在或拼写错误；若是私有仓库，则令牌权限不足。 |
| 日志出现 `overwrite.xml not found at /app/overwrite.xml` | 有项目用了 `overwrite@<数字>`，但该文件不存在。请创建 `./overwrite.xml`，见[挂载 overwrite.xml](#挂载-overwritexml)。 |
| 某张卡片显示 `overwrite.xml has no <overwrite> block with <id>N</id>` | `overwrite@N` 中的数字在 `overwrite.xml` 里没有对应的 `<id>N</id>`。核对两个文件，或补上缺失的段落。 |
| `overwrite.xml` 报 `EISDIR`／「是一个目录」 | 文件还不存在时就启用了挂载，Docker 把它建成了目录。执行 `rmdir ./overwrite.xml`，创建同名文件，再重建容器。 |
| 手动条目的下载按钮 404 | `<file>` 链接写错或已失效——按钮直接指向该地址，biangbiang 不会去校验它。 |
| 提示 `API rate limit exceeded` | 在 `.env` 中设置 `GITHUB_TOKEN`。 |
| 卡片不显示图标 | `<icon>` 路径写错，或文件对 uid 1000 不可读。路径是相对 `config.xml` 解析的。 |
| PWA 图标还是默认的 | `<favicon>` 缺失/不可读，或 ImageMagick 执行失败。查看 `docker compose logs \| grep '\[pwa\]'`，然后 `docker compose restart biangbiang`。 |
| 安装后的应用名还是默认的 | `manifest.webmanifest` 由 `<title>` 在启动时生成。确认 `config.xml` 里的 `<title>` 正确，然后 `docker compose restart biangbiang`。日志中出现 `[pwa] cannot read` 说明前端构建产物缺少 manifest 模板。 |
| `./data` 报 `EACCES` / `permission denied` | 容器无法写入数据目录。只要容器以 root 启动，entrypoint 就会自动修正属主，所以出现这个错误说明你设置了 `user:`／`--user`，或者把 `./data` 挂成了只读。执行 `sudo chown -R 1000:1000 ./data`，如果加了 `:ro` 就去掉它。 |
| `http://127.0.0.1:8080` 正常，但域名访问不了 | 检查 nginx 的 `proxy_pass` 目标、`server_name`，以及防火墙是否放行了 80/443 端口。 |
| 下载中途断开 | 调大 nginx 配置中的 `proxy_read_timeout` / `proxy_send_timeout`。 |
| Service Worker 始终注册不上 | 站点必须通过 **HTTPS**（或 `localhost`）访问。直接用 IP + 明文 HTTP 不属于安全上下文。 |
| certbot 校验失败 | DNS 尚未生效、80 端口被占用或被墙，或已有其他 server 段占用了同一个 `server_name`。 |
| 磁盘被旧文件占满 | 每个项目只会保留最新版本。检查 `./data` 中是否还有其他数据，并考虑调整 `DOWNLOAD_CONCURRENCY` 或扩容。 |

### 常用命令

```bash
docker compose ps                                   # 查看健康状态
docker inspect --format '{{.State.Health.Status}}' biangbiang
docker compose exec biangbiang node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>r.text()).then(console.log)"
curl -s http://127.0.0.1:8080/api/state | head -c 400
du -sh /srv/biangbiang/data
```
