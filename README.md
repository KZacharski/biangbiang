# biangbiang

**简体中文** · [English](README_en_US.md)

![100% SLOP —— 但这个徽章是人工画的](.github/assets/slop_badge.webp)

一站式自托管 **GitHub Release 构建产物镜像**。它会跟踪 `config.xml` 中列出的每个项目的最新 Release，把构建产物下载到你的服务器，并通过一个快速、适配移动端的 Vue + [Ant Design Vue](https://antdv.com) 前端对外提供下载。

整个项目运行在**单个 Docker 容器**内：一个 Node.js (Express) 进程同时提供 API、镜像文件以及构建好的单页应用。

> 仓库地址：<https://github.com/xiaomianguan/biangbiang/>
> 部署文档：[进阶部署指南（简体中文）](ADVANCED_INSTRUCTION_zh_CN.md) · [Advanced Deployment Guide (English)](ADVANCED_INSTRUCTION_en_US.md)

---

## 功能特性

- **开箱即用**：仓库自带一份可直接使用的 `config.xml`、`overwrite.xml` 与 `assets/`（favicon、项目图标，以及一份随附字体）。克隆后执行 `docker compose up -d --build` 就能看到一个完整站点，无需先准备任何文件——你可以在此基础上继续改，也可以把样例删掉、从零开始。
- **自动镜像**每个 GitHub Release 中附带的所有构建产物。
- **排除源码归档**——GitHub 自动附加的 `Source code (zip)` / `Source code (tar.gz)` 永远不会被镜像。
- **每 24 小时检查一次更新**（可配置），并且每个项目在磁盘上只保留最新版本。
- **支持任意数量的项目**——`config.xml` 中每个 `<project>` 对应一张卡片。
- **支持手动条目**——`<repo>` 写成 `overwrite@<数字>` 时，卡片数据改由 `overwrite.xml` 提供，从而把 GitHub 项目与任意外部下载链接混合在同一个站点里。
- **完全由配置驱动**：标题、favicon 以及各项目的图标/名称/仓库地址全部来自 `config.xml`；图标是普通的 PNG/WEBP 文件，仓库自带一套可直接使用、也可随意替换的样例。
- **可选的项目排序**：把 `<sortable>` 设为 `true` 后，页头会出现排序下拉框，访客可按名称、最近更新、文件最多或文件最少重新排列卡片；设为 `false` 或省略时，卡片严格保持 `config.xml` 中的书写顺序。
- **可配置主题色**：`<accent>` 填 Ant Design [基础色板](https://ant.design/docs/spec/colors) 中的色名（如 `volcano`、`purple`），站点即用该色替代默认的品牌蓝；省略或写错时保持默认蓝色。
- **可配置字体**：`<font>` 填字体文件路径（如 `.woff2`），站点整体——含 Ant Design 组件——都会改用该字体；路径与 `<favicon>` 一样相对于 `config.xml` 所在目录解析，省略或指向不存在的文件时保持系统默认字体。
- **浅色 / 深色主题**，默认「跟随系统」，可手动切换为浅色或深色。基于 Ant Design Vue 的设计令牌实现。
- **可安装为 PWA**（manifest + Service Worker）——按设计**不提供离线缓存**；应用名跟随 `<title>`，图标跟随 `<favicon>`。
- **简体中文（zh-Hans）**界面，文案硬编码。
- **响应式卡片网格**：手机单列、平板双列、桌面三列，每张卡片各自独立高度，不会被拉伸到与同行最高的一张齐平。较矮的卡片还会上浮填满下方的空位，卡片之间始终只有 16px 的间距——Safari 26.4+ 走原生 Grid Lanes，其他浏览器由前端自行排版。
- **健壮性**：某个仓库损坏或地址错误不会拖垮整个站点——同步失败的项目会保留上一次成功的数据。自带的样例配置刻意保留了两张失败卡片来演示这一点。

---

## 工作原理

```text
                    每 24 小时  ┌──────────────────────────────┐
        GitHub REST API ──────► │  镜像引擎（后端）            │
   (releases/latest)            │  · 获取最新 Release          │
                                │  · 下载构建产物              │
                                │  · 删除旧版本                │
                                └──────────────┬───────────────┘
                                               │ 写入
                                               ▼
                              data/releases/<owner>/<repo>/<version>/<file>
                                               │
   浏览器 ──► Express ─────────────────────────┘
                 ├─ /                  → 构建好的 Vue SPA（静态文件）
                 ├─ /api/state         → 实时 JSON：标题、项目、版本、构建产物
                 ├─ /media/<path>      → 来自配置目录的 favicon 与项目图标
                 └─ /dl/<owner>/<repo>/<version>/<file>  → 镜像后的构建产物
```

前端是一个**静态打包产物**，但它渲染的数据是在运行时通过 `GET /api/state` 获取的。当有新的 Release 被镜像后，版本标签和下载按钮的集合会自动更新——**永远不需要重新构建前端**。页面还会定时刷新数据（并在标签页重新获得焦点时刷新），让长时间打开的页面保持最新。

---

## 项目结构

```text
biangbiang/
├── .github/assets/         # README 徽章
├── config.xml              # 站点配置，自带可直接使用的样例（挂载进容器）
├── overwrite.xml           # 手动条目（非 GitHub 项目），自带样例（挂载进容器）
├── assets/                 # favicon、项目图标与字体，自带样例（挂载，只读）
├── data/                   # 镜像产物、state.json、生成的 PWA 图标与 manifest
├── backend/                # Node.js + Express 的 API / 镜像引擎
│   └── src/
│       ├── index.js        # HTTP 服务：SPA、/api、/media、/dl
│       ├── cli.js          # 单次镜像运行（npm run mirror）
│       ├── config.js       # 解析 config.xml + 规范化仓库地址
│       ├── github.js       # GitHub API 客户端 + 流式下载
│       ├── mirror.js       # 镜像引擎（比对、下载、清理）
│       ├── overwrite.js    # 解析 overwrite.xml（手动条目）
│       ├── pwaIcons.js     # 用 ImageMagick 由 favicon 生成 PWA 图标
│       ├── pwaManifest.js  # 由 <title> 生成 manifest（安装后的应用名）
│       ├── scheduler.js    # 每 24 小时运行的定时任务
│       ├── state.js        # 内存态 + 持久化状态
│       └── env.js          # 环境变量配置
├── frontend/               # Vue 3 + Vite + Ant Design Vue 的 SPA
│   ├── public/             # manifest、Service Worker、PWA 默认图标
│   └── src/
│       ├── App.vue         # ConfigProvider（主题 + zh-CN 语言包）
│       ├── api.ts          # API 客户端与格式化工具
│       ├── theme.ts        # 自动 / 浅色 / 深色主题逻辑
│       ├── strings.ts      # 硬编码的简体中文界面文案
│       └── components/     # SiteView、ProjectCard、ThemeSwitcher
├── Dockerfile
├── docker-compose.yml             # 最简示例
├── docker-compose.advanced.yml    # 生产部署示例（仅绑定回环地址 + nginx）
├── .env.example                   # 复制为 .env 后使用
├── ADVANCED_INSTRUCTION_zh_CN.md  # 进阶部署指南（简体中文）
├── ADVANCED_INSTRUCTION_en_US.md  # 进阶部署指南（美式英语）
├── README_en_US.md                # README（美式英语）
└── README.md
```

---

## 配置说明（config.xml）

`config.xml` 与 `assets/` 目录放在一起。所有图片路径都**相对于 `config.xml` 所在的目录**解析，因此图标既可以与它并排存放，也可以放在 `assets/` 子目录中。

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

| 标签         | 位置           | 说明 |
|--------------|----------------|------|
| `<title>`    | 根节点         | 站点标题，显示在页头、浏览器标签页，以及**安装后的应用名**（每次启动时写入 manifest）。 |
| `<favicon>`  | 根节点         | 可选。用作站点 favicon 的 PNG/WEBP 文件。 |
| `<sortable>` | 根节点         | 可选。`true` 时页头出现排序下拉框，访客可按「按名称 / 最近更新 / 文件最多 / 文件最少」重新排列卡片，默认「按名称」（即字母顺序）；`false` 或省略时，卡片严格保持 `<project>` 的书写顺序。 |
| `<accent>`   | 根节点         | 可选。Ant Design 基础色板名（`red` / `volcano` / `orange` / `gold` / `yellow` / `lime` / `green` / `cyan` / `blue` / `geekblue` / `purple` / `magenta`，大小写不敏感）。用该色替换站点默认的品牌蓝（Daybreak Blue）。省略、留空或填了无法识别的值时，一律回退为默认蓝色。 |
| `<font>`     | 根节点         | 可选。字体文件路径（如 `assets/MyFont.woff2`），与 `<favicon>` 一样相对于 `config.xml` 所在目录解析。站点整体（含 Ant Design 组件）改用该字体。省略、留空或文件不存在时回退为系统默认字体。 |
| `<project>`  | 根节点（0..N） | 每个项目一项 → 站点上的一张卡片。 |
| `<icon>`    | 项目内         | 卡片图标所用的 PNG/WEBP 文件。可选。 |
| `<name>`    | 项目内         | 项目显示名称。 |
| `<repo>`    | 项目内         | GitHub 仓库地址。 |

**支持的 `<repo>` 写法**（都会解析为 `owner/repo`）：

```text
https://github.com/user/project1
https://github.com/user/project1.git
https://github.com/user/project1/
git@github.com:user/project1.git
user/project1
```

可以自由增删 `<project>` 段落——站点始终为每个有效条目渲染且仅渲染一张卡片。`<repo>` 缺失或格式错误的条目会被跳过，且不影响其他条目。

### 手动条目（overwrite.xml）

`<repo>` 除了写 GitHub 地址，还可以写成 `overwrite@<数字>`。这样这张卡片的数据就不再来自 GitHub，而是来自与 `config.xml` **同目录**下的 `overwrite.xml`：

```xml
<project>
    <icon>assets/icon2.webp</icon>
    <name>我的私有项目</name>
    <repo>overwrite@1</repo>
</project>
```

`overwrite.xml` 的结构：

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

| 标签                 | 说明 |
|----------------------|------|
| `<id>`               | 与 `config.xml` 中 `overwrite@<数字>` 的数字对应。 |
| `<version>`          | 卡片上显示的版本号，代替自动获取的版本。可省略。 |
| `<repo>`             | 「查看原仓库」按钮指向的地址。可省略，省略时该按钮不显示。 |
| `<downloads>/<file>` | 每个 `<file>` 对应一个下载按钮，按钮直接指向该外部链接。 |

要点：

- **只有**当 `config.xml` 中至少存在一个 `overwrite@<数字>` 时才会去读取 `overwrite.xml`。如果所有 `<repo>` 都是 GitHub 地址，这个文件根本不会被打开。
- 手动条目**不会**下载或缓存任何文件——下载按钮直接指向你填写的外部链接，因此不占用服务器磁盘，也不受 GitHub 速率限制影响。
- 手动条目**不显示「发布于」日期**（没有 Release，自然没有发布日期）；文件大小同样无法得知，因此也不显示。
- 同一个 `config.xml` 中可以随意混用 GitHub 项目与手动条目。
- 下载按钮上显示的文件名取自链接 URL 的最后一段。
- Docker 部署时 `overwrite.xml` 会与 `config.xml` 一样以只读方式挂载进容器，无需任何额外操作。

> **仓库自带一套开箱即用的样例素材。** 新克隆的仓库里，`config.xml`、`overwrite.xml` 与 `assets/`（favicon、项目图标，以及一份随附字体）都是齐全的，`docker compose up -d --build` 之后无需任何改动就能看到一个完整站点。要换成自己的外观，把 `assets/` 里的文件替换掉并在 `config.xml` 中引用即可；想从零开始，就把这些样例文件删掉、只留自己的配置。

---

## 快速开始（Docker）

> **要部署到公网服务器？** 请看进阶指南：
> [简体中文](ADVANCED_INSTRUCTION_zh_CN.md) ·
> [English](ADVANCED_INSTRUCTION_en_US.md)。
> 它涵盖 `docker-compose.advanced.yml` 示例、`config.xml` 详解、图片素材的放置方式，
> 以及用 nginx 反向代理把容器接入域名并配置 HTTPS。

### 1. 获取项目

克隆仓库，再切到**最新的稳定版**（最新的 release 标签）：

```bash
git clone https://github.com/xiaomianguan/biangbiang.git
cd biangbiang
git checkout "$(git tag --sort=-v:refname | head -1)"   # 最新的 release 标签
```

> **想改用 git 开发版（跟踪 `main` 分支）？** 跳过最后那行 `git checkout`，克隆出来的就是 `main`。开发版包含最新的改动，但尚未作为正式版本发布，可能不稳定。

### 2. 准备配置与图标（可跳过：仓库自带可用样例）

```
biangbiang/
├── config.xml
├── overwrite.xml           # 手动条目：仅在用到 overwrite@<数字> 时需要
└── assets/
    ├── favicon.png
    ├── icon1.png
    └── icon2.webp
```

新克隆的仓库**已经包含**以上全部文件，所以这一步是可选的：直接 `docker compose up -d --build` 就能看到一个完整站点。要改成自己的站点，编辑 `config.xml` 填入标题与项目（语法见上一节），并把 `assets/` 里的图片换成自己的即可。

> **样例配置里有两张「故意失败」的卡片。** 自带的 `config.xml` 分别用 `https://github.com/user/project2`（不存在的仓库）和 `overwrite@2`（`overwrite.xml` 中没有对应 `<id>`）演示两种错误状态——它们用来展示站点在仓库写错或手动条目缺失时的表现，属于预期行为，不是 bug。把它们删掉，或改成你自己的条目即可。

> **用到手动条目时**，直接在 `overwrite.xml` 里填写条目即可——`docker-compose.yml` 已经把它挂载进容器了。
>
> 改完宿主机上的文件后，点一下界面上的「立即检查更新」就会生效，不需要重建容器。
>
> 注意保持文件存在：若 `./overwrite.xml` 缺失，Docker 会把它建成一个空目录，相关卡片会以 `EISDIR` 报错。仓库自带一份可直接使用的样例，新克隆的仓库不受影响。

### 3. 构建并启动

```bash
docker compose up -d --build
```

### 4. 打开站点

浏览器访问 <http://localhost:8080>。

首次同步会在容器启动时立即开始；之后每 24 小时同步一次（见 `CHECK_INTERVAL_HOURS`）。镜像产物保存在宿主机的 `./data` 目录中，重启后依然保留。

### 不使用 Compose 直接运行

```bash
docker build -t biangbiang .
docker run -d --name biangbiang -p 8080:8080 \
  -v "$PWD/config.xml:/app/config.xml:ro" \
  -v "$PWD/assets:/app/assets:ro" \
  -v "$PWD/data:/app/data" \
  biangbiang
```

### 常用运维命令

```bash
docker compose logs -f          # 查看实时日志
docker compose restart          # 重启（会重新生成 PWA 图标与应用名）
docker compose down             # 停止并移除容器
```

### 更新到最新版本

稳定版以标签形式发布。取回标签、切到最新的 release 标签，再重建容器：

```bash
git fetch --tags
git checkout "$(git tag --sort=-v:refname | head -1)"   # 最新的 release 标签
docker compose up -d --build
```

> 检出标签后处于 detached HEAD 状态，这对部署没有影响。想固定在某个具体版本，把 `"$(...)"` 换成 `v1.0.1` 这样的标签名即可。

如果部署的是 **git 开发版**（`main` 分支），改用 `git pull` 即可：

```bash
git pull
docker compose up -d --build
```

`./config.xml`、`./overwrite.xml`、`./assets` 与 `./data` 都通过挂载保留在宿主机上，升级不会丢失它们。

---

## 本地开发

分别运行后端和 Vite 开发服务器，以获得热更新。

```bash
# 终端 1 —— 后端（镜像到 ./data，提供 API 与文件）
cd backend
npm install
CONFIG_PATH=../config.xml DATA_DIR=../data PUBLIC_DIR=../frontend/dist npm start

# 终端 2 —— 前端开发服务器（把 /api、/dl、/media 代理到 :8080）
cd frontend
npm install
npm run dev            # http://localhost:5173
```

常用脚本：

```bash
cd backend  && npm run mirror   # 执行一次镜像后退出
cd frontend && npm run build    # 构建生产版 SPA
cd frontend && npm run type-check
```

> 本地生成 PWA 图标需要安装 ImageMagick，详见下文「PWA」一节。

---

## 环境变量

| 变量                    | 默认值                  | 说明 |
|-------------------------|-------------------------|------|
| `PORT`                  | `8080`                  | HTTP 端口。 |
| `HOST`                  | `0.0.0.0`               | 监听地址。 |
| `TZ`                    | `Asia/Shanghai`         | 容器时区（IANA 名称）。影响日志与后端渲染的本地时间。可在 `docker-compose.yml` / `.env` 中修改。 |
| `CONFIG_PATH`           | `/app/config.xml`       | `config.xml` 的路径。 |
| `DATA_DIR`              | `/app/data`             | 存放镜像产物与 `state.json` 的目录。 |
| `PUBLIC_DIR`            | `/app/public`           | 构建后的前端目录。 |
| `CHECK_INTERVAL_HOURS`  | `24`                    | 轮询 GitHub 新 Release 的间隔（小时）。 |
| `MIRROR_ON_START`       | `true`                  | 启动时是否立即执行一次同步。 |
| `DOWNLOAD_CONCURRENCY`  | `4`                     | 每个项目并发下载的数量。 |
| `GITHUB_TOKEN`          | *（空）*                | 可选。提升 API 速率上限（60 → 5000 次/小时）。 |

这些变量都可以在 `docker-compose.yml` 的 `environment` 段落中设置。

---

## HTTP 接口

| 方法   | 路径                                    | 说明 |
|--------|-----------------------------------------|------|
| `GET`  | `/api/state`                            | 当前站点状态：标题、favicon、项目、版本与构建产物。 |
| `GET`  | `/api/health`                           | 健康检查（存活探针）。 |
| `POST` | `/api/refresh`                          | 立即触发一次镜像（页面上「立即检查更新」按钮使用）。 |
| `GET`  | `/media/<path>`                         | 相对配置目录解析的 favicon / 项目图标。 |
| `GET`  | `/dl/<owner>/<repo>/<version>/<file>`   | 下载镜像后的构建产物。 |

`GET /api/state` 返回示例：

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

`status` 的取值：`ok`、`empty`（尚无 Release）或 `error`（例如仓库不存在）。同步失败的项目会保留上一次成功镜像的内容。

---

## 说明

### 主题
主题默认为**跟随系统（auto）**，跟随操作系统的浅色/深色偏好，并在系统切换时实时更新。页头的切换控件允许强制使用**浅色**或**深色**，选择会记录在 `localStorage` 中。两种主题均使用 Ant Design Vue 的 `defaultAlgorithm` / `darkAlgorithm` 设计令牌。

### PWA
应用附带 `manifest.webmanifest` 与一个极简的 Service Worker，因此可以安装到主屏幕/桌面。该 Service Worker **不做任何缓存**——它是纯网络透传，因此按设计没有离线模式。

可安装的**应用图标始终跟随你的 `<favicon>`**，**应用名则始终跟随 `<title>`**。每次启动时，后端都会用 ImageMagick 由 favicon 派生出整套图标：

| 输出 | 尺寸 | 说明 |
|------|------|------|
| `pwa-192x192.png` | 192×192 | 保留透明度，补齐为正方形 |
| `pwa-512x512.png` | 512×512 | 保留透明度，补齐为正方形 |
| `pwa-maskable-512x512.png` | 512×512 | 图案缩放到 80%，背景填充为 favicon 的平均颜色 |
| `apple-touch-icon.png` | 180×180 | 平铺到白色背景（iOS 不支持透明） |

图标写入 `<DATA_DIR>/pwa/`，并通过 manifest 中声明的路径对外提供。每次启动时，后端还会在同一目录重新生成 `manifest.webmanifest`，把其中的 `name` / `short_name`（即安装后显示的应用名）替换为 `config.xml` 里的 `<title>`，其余字段（描述、配色、图标列表）沿用前端构建产物中的模板。因此修改 `<favicon>` 或 `<title>` 后重启容器，即可更新可安装图标与应用名。favicon 可以是 ImageMagick 能读取的任意格式（PNG、WEBP 等）。若未配置 `<favicon>`，或系统中没有 ImageMagick，则会改用 `frontend/public/` 中自带的默认图标；若 manifest 模板读取失败，则同样回退到自带的默认 manifest。

Docker 镜像中已安装 ImageMagick。本地开发时请自行安装（`brew install imagemagick`、`apt install imagemagick` 等）。

### 速率限制
未认证的 GitHub API 请求限制为每小时 60 次，对于少量项目、每天轮询一次来说绰绰有余。如果配置的项目很多，请在 `docker-compose.yml` 中设置 `GITHUB_TOKEN`。

### 以非 root 用户运行
容器的 entrypoint 会先以 root 启动，把 `./data` 的属主改成 `node` 用户（uid 1000），然后立刻降权运行——因此 bind mount 开箱即用，不需要手动 `chown`。如果你用 `user:` 或 `--user` 强制指定了其他用户，则该用户必须已经能写入 `./data`。

---

## 许可证

本项目基于 [The Unlicense](https://unlicense.org) 发布，已进入公有领域（public domain）。你可以自由地复制、修改、发布、使用、编译、出售或分发本软件，无论是源代码形式还是编译后的二进制形式，用于任何目的（商业或非商业），且无需署名。

完整条款见仓库根目录的 [LICENSE](LICENSE) 文件。
