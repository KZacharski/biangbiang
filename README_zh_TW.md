# biangbiang

[简体中文](README.md) · **繁體中文** · [English](README_en_US.md) · [Polski](README_pl_PL.md) · [Русский](README_ru_RU.md) · [Svenska](README_sv_SE.md)

![100% SLOP —— 但這個徽章是人工畫的](.github/assets/slop_badge.webp)

一站式自架 **GitHub Release 建置產物鏡像**。它會追蹤 `config.xml` 中列出的每個專案的最新 Release，把建置產物下載到你的伺服器，並透過一個快速、適配行動裝置的 Vue + [Ant Design Vue](https://antdv.com) 前端對外提供下載。

整個專案執行在**單一 Docker 容器**內：一個 Node.js (Express) 行程同時提供 API、鏡像檔案以及建置好的單頁應用程式。

> 倉庫位址：<https://github.com/xiaomianguan/biangbiang/>
> 部署文件：[進階部署指南（繁體中文）](ADVANCED_INSTRUCTION_zh_TW.md) · [Advanced Deployment Guide (English)](ADVANCED_INSTRUCTION_en_US.md)

---

## 功能特色

- **開箱即用**：倉庫自帶一份可直接使用的 `config.xml`、`overwrite.xml` 與 `assets/`（favicon、專案圖示，以及一份隨附字型）。複製後執行 `docker compose up -d --build` 就能看到一個完整站點，無需先準備任何檔案——你可以在這個基礎上繼續改，也可以把範例刪掉、從零開始。
- **自動鏡像**每個 GitHub Release 中附帶的所有建置產物。
- **排除原始碼封存檔**——GitHub 自動附加的 `Source code (zip)` / `Source code (tar.gz)` 永遠不會被鏡像。
- **每 24 小時檢查一次更新**（可設定），並且每個專案在磁碟上只保留最新版本。
- **支援任意數量的專案**——`config.xml` 中每個 `<project>` 對應一張卡片。
- **支援手動條目**——`<repo>` 寫成 `overwrite@{數字}` 時，卡片資料改由 `overwrite.xml` 提供，從而把 GitHub 專案與任意外部下載連結混合在同一個站點裡。
- **完全由設定驅動**：標題、favicon 以及各專案的圖示/名稱/倉庫位址全部來自 `config.xml`；圖示是普通的 PNG/WEBP 檔案，倉庫自帶一套可直接使用、也可隨意替換的範例。
- **可選的專案排序**：把 `<sortable>` 設為 `true` 後，頁首會出現排序下拉選單，訪客可依名稱、最近更新、檔案最多或檔案最少重新排列卡片；設為 `false` 或省略時，卡片嚴格保持 `config.xml` 中的書寫順序。
- **可設定主題色**：`<accent>` 填 Ant Design [基礎色板](https://ant.design/docs/spec/colors) 中的色名（如 `volcano`、`purple`），站點即用該色取代預設的品牌藍；省略或寫錯時保持預設藍色。
- **可設定字型**：`<font>` 填字型檔案路徑（如 `.woff2`），站點整體——含 Ant Design 元件——都會改用該字型；路徑與 `<favicon>` 一樣相對於 `config.xml` 所在目錄解析，省略或指向不存在的檔案時保持系統預設字型。
- **淺色 / 深色主題**，預設「跟隨系統」，可手動切換為淺色或深色。以 Ant Design Vue 的設計權杖實作。
- **可安裝為 PWA**（manifest + Service Worker）——依設計**不提供離線快取**；應用程式名稱跟隨 `<title>`，圖示跟隨 `<favicon>`。
- **多語言介面**：把 `<lang>` 設為 `zh_cn` / `zh_tw` / `en_us` / `pl_pl` / `ru_ru` / `sv_se` 之一，整套介面文案、日期格式以及 Ant Design 元件自帶的文案都會切換為該語言；省略或填了無法辨識的值時使用簡體中文。
- **響應式卡片網格**：手機單欄、平板雙欄、桌面三欄，每張卡片各自獨立高度，不會被拉伸到與同列最高的一張齊平。較矮的卡片還會上浮填滿下方的空位，卡片之間始終只有 16px 的間距——Safari 26.4+ 走原生 Grid Lanes，其他瀏覽器由前端自行排版。
- **健壯性**：某個倉庫損壞或位址錯誤不會拖垮整個站點——同步失敗的專案會保留上一次成功的資料。自帶的範例設定刻意保留了兩張失敗卡片來示範這一點。

---

## 運作原理

```text
                    每 24 小時  ┌──────────────────────────────┐
        GitHub REST API ──────► │  鏡像引擎（後端）            │
   (releases/latest)            │  · 取得最新 Release          │
                                │  · 下載建置產物              │
                                │  · 刪除舊版本                │
                                └──────────────┬───────────────┘
                                               │ 寫入
                                               ▼
                              data/releases/{owner}/{repo}/{version}/{file}
                                               │
   瀏覽器 ──► Express ─────────────────────────┘
                 ├─ /                  → 建置好的 Vue SPA（靜態檔案）
                 ├─ /api/state         → 即時 JSON：標題、專案、版本、建置產物
                 ├─ /media/{path}      → 來自設定目錄的 favicon 與專案圖示
                 └─ /dl/{owner}/{repo}/{version}/{file}  → 鏡像後的建置產物
```

前端是一個**靜態打包產物**，但它呈現的資料是在執行時透過 `GET /api/state` 取得的。當有新的 Release 被鏡像後，版本標籤與下載按鈕的集合會自動更新——**永遠不需要重新建置前端**。頁面還會定時重新整理資料（並在分頁重新取得焦點時重新整理），讓長時間開啟的頁面保持最新。

---

## 專案結構

```text
biangbiang/
├── .github/assets/         # README 徽章
├── config.xml              # 站點設定，自帶可直接使用的範例（掛載進容器）
├── overwrite.xml           # 手動條目（非 GitHub 專案），自帶範例（掛載進容器）
├── assets/                 # favicon、專案圖示與字型，自帶範例（掛載，唯讀）
├── data/                   # 鏡像產物、state.json、產生的 PWA 圖示與 manifest
├── backend/                # Node.js + Express 的 API / 鏡像引擎
│   └── src/
│       ├── index.js        # HTTP 服務：SPA、/api、/media、/dl
│       ├── cli.js          # 單次鏡像執行（npm run mirror）
│       ├── config.js       # 解析 config.xml + 正規化倉庫位址
│       ├── github.js       # GitHub API 用戶端 + 串流下載
│       ├── mirror.js       # 鏡像引擎（比對、下載、清理）
│       ├── overwrite.js    # 解析 overwrite.xml（手動條目）
│       ├── pwaIcons.js     # 用 ImageMagick 由 favicon 產生 PWA 圖示
│       ├── pwaManifest.js  # 由 <title> 產生 manifest（安裝後的應用程式名稱）
│       ├── scheduler.js    # 每 24 小時執行的定時工作
│       ├── state.js        # 記憶體狀態 + 持久化狀態
│       └── env.js          # 環境變數設定
├── frontend/               # Vue 3 + Vite + Ant Design Vue 的 SPA
│   ├── public/             # manifest、Service Worker、PWA 預設圖示
│   └── src/
│       ├── App.vue         # ConfigProvider（主題 + 語言包）
│       ├── api.ts          # API 用戶端與格式化工具
│       ├── theme.ts        # 自動 / 淺色 / 深色主題邏輯
│       ├── strings.ts      # 介面語言狀態與文案查詢
│       ├── locales/        # 六種語言的文案包
│       └── components/     # SiteView、ProjectCard、ThemeSwitcher
├── Dockerfile
├── docker-compose.yml             # 最簡範例
├── docker-compose.advanced.yml    # 生產部署範例（僅綁定回送位址 + nginx）
├── .env.example                   # 複製為 .env 後使用
├── ADVANCED_INSTRUCTION_zh_CN.md  # 進階部署指南（簡體中文）
├── ADVANCED_INSTRUCTION_zh_TW.md  # 進階部署指南（繁體中文）
├── ADVANCED_INSTRUCTION_en_US.md  # 進階部署指南（美式英語）
├── ADVANCED_INSTRUCTION_pl_PL.md  # 進階部署指南（波蘭語）
├── ADVANCED_INSTRUCTION_ru_RU.md  # 進階部署指南（俄語）
├── ADVANCED_INSTRUCTION_sv_SE.md  # 進階部署指南（瑞典語）
├── README.md                      # README（簡體中文）
├── README_zh_TW.md                # README（繁體中文）
├── README_en_US.md                # README（美式英語）
├── README_pl_PL.md                # README（波蘭語）
├── README_ru_RU.md                # README（俄語）
└── README_sv_SE.md                # README（瑞典語）
```

---

## 設定說明（config.xml）

`config.xml` 與 `assets/` 目錄放在一起。所有圖片路徑都**相對於 `config.xml` 所在的目錄**解析，因此圖示既可以與它並排存放，也可以放在 `assets/` 子目錄中。

```xml
<favicon>assets/favicon.png</favicon>
<title>Page title</title>
<lang>zh_cn</lang>
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

| 標籤         | 位置           | 說明 |
|--------------|----------------|------|
| `<title>`    | 根節點         | 站點標題，顯示在頁首、瀏覽器分頁，以及**安裝後的應用程式名稱**（每次啟動時寫入 manifest）。 |
| `<lang>`     | 根節點         | 選用。介面語言，取 `zh_cn` / `zh_tw` / `en_us` / `pl_pl` / `ru_ru` / `sv_se` 之一（大小寫不敏感，也接受 `zh-CN` 這種連字號寫法）。省略或填了無法辨識的值時一律回退為 `zh_cn`（簡體中文）。 |
| `<favicon>`  | 根節點         | 選用。用作站點 favicon 的 PNG/WEBP 檔案。 |
| `<sortable>` | 根節點         | 選用。`true` 時頁首出現排序下拉選單，訪客可依「依名稱 / 最近更新 / 檔案最多 / 檔案最少」重新排列卡片，預設「依名稱」（即字母順序）；`false` 或省略時，卡片嚴格保持 `<project>` 的書寫順序。 |
| `<accent>`   | 根節點         | 選用。Ant Design 基礎色板名（`red` / `volcano` / `orange` / `gold` / `yellow` / `lime` / `green` / `cyan` / `blue` / `geekblue` / `purple` / `magenta`，大小寫不敏感）。用該色取代站點預設的品牌藍（Daybreak Blue）。省略、留空或填了無法辨識的值時，一律回退為預設藍色。 |
| `<font>`     | 根節點         | 選用。字型檔案路徑（如 `assets/MyFont.woff2`），與 `<favicon>` 一樣相對於 `config.xml` 所在目錄解析。站點整體（含 Ant Design 元件）改用該字型。省略、留空或檔案不存在時回退為系統預設字型。 |
| `<project>`  | 根節點（0..N） | 每個專案一項 → 站點上的一張卡片。 |
| `<icon>`     | 專案內         | 卡片圖示所用的 PNG/WEBP 檔案。選用。 |
| `<name>`     | 專案內         | 專案顯示名稱。 |
| `<repo>`     | 專案內         | GitHub 倉庫位址。 |

**支援的 `<repo>` 寫法**（都會解析為 `owner/repo`）：

```text
https://github.com/user/project1
https://github.com/user/project1.git
https://github.com/user/project1/
git@github.com:user/project1.git
user/project1
```

可以自由增刪 `<project>` 段落——站點始終為每個有效條目呈現且僅呈現一張卡片。`<repo>` 缺失或格式錯誤的條目會被略過，且不影響其他條目。


### 手動條目（overwrite.xml）

`<repo>` 除了寫 GitHub 位址，還可以寫成 `overwrite@{數字}`。這樣這張卡片的資料就不再來自 GitHub，而是來自與 `config.xml` **同目錄**下的 `overwrite.xml`：

```xml
<project>
    <icon>assets/icon2.webp</icon>
    <name>我的私有專案</name>
    <repo>overwrite@1</repo>
</project>
```

`overwrite.xml` 的結構：

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

| 標籤                 | 說明 |
|----------------------|------|
| `<id>`               | 與 `config.xml` 中 `overwrite@{數字}` 的數字對應。 |
| `<version>`          | 卡片上顯示的版本號，代替自動取得的版本。可省略。 |
| `<repo>`             | 「查看原倉庫」按鈕指向的位址。可省略，省略時該按鈕不顯示。 |
| `<downloads>/<file>` | 每個 `<file>` 對應一個下載按鈕，按鈕直接指向該外部連結。 |

重點：

- **只有**當 `config.xml` 中至少存在一個 `overwrite@{數字}` 時才會去讀取 `overwrite.xml`。如果所有 `<repo>` 都是 GitHub 位址，這個檔案根本不會被開啟。
- 手動條目**不會**下載或快取任何檔案——下載按鈕直接指向你填寫的外部連結，因此不佔用伺服器磁碟，也不受 GitHub 速率限制影響。
- 手動條目**不顯示「發佈於」日期**（沒有 Release，自然沒有發佈日期）；檔案大小同樣無法得知，因此也不顯示。
- 同一個 `config.xml` 中可以隨意混用 GitHub 專案與手動條目。
- 下載按鈕上顯示的檔案名稱取自連結 URL 的最後一段。
- Docker 部署時 `overwrite.xml` 會與 `config.xml` 一樣以唯讀方式掛載進容器，無需任何額外操作。

> **倉庫自帶一套開箱即用的範例素材。** 新複製的倉庫裡，`config.xml`、`overwrite.xml` 與 `assets/`（favicon、專案圖示，以及一份隨附字型）都是齊全的，`docker compose up -d --build` 之後無需任何改動就能看到一個完整站點。要換成自己的外觀，把 `assets/` 裡的檔案替換掉並在 `config.xml` 中引用即可；想從零開始，就把這些範例檔案刪掉、只留自己的設定。

---

## 快速開始（Docker）

> **要部署到公網伺服器？** 請看進階指南：
> [繁體中文](ADVANCED_INSTRUCTION_zh_TW.md) ·
> [English](ADVANCED_INSTRUCTION_en_US.md)。
> 它涵蓋 `docker-compose.advanced.yml` 範例、`config.xml` 詳解、圖片素材的放置方式，
> 以及用 nginx 反向代理把容器接入網域並設定 HTTPS。

### 1. 取得專案

複製倉庫，再切到**最新的穩定版**（最新的 release 標籤）：

```bash
git clone https://github.com/xiaomianguan/biangbiang.git
cd biangbiang
git checkout "$(git tag --sort=-v:refname | head -1)"   # 最新的 release 標籤
```

> **想改用 git 開發版（追蹤 `main` 分支）？** 略過最後那行 `git checkout`，複製出來的就會是 `main`。開發版包含最新的改動，但尚未作為正式版本發佈，可能不穩定。

### 2. 準備設定與圖示（可略過：倉庫自帶可用範例）

```
biangbiang/
├── config.xml
├── overwrite.xml           # 手動條目：僅在用到 overwrite@{數字} 時需要
└── assets/
    ├── favicon.png
    ├── icon1.png
    └── icon2.webp
```

新複製的倉庫**已經包含**以上全部檔案，所以這一步是選用的：直接 `docker compose up -d --build` 就能看到一個完整站點。要改成自己的站點，編輯 `config.xml` 填入標題與專案（語法見上一節），並把 `assets/` 裡的圖片換成自己的即可。

> **範例設定裡有兩張「故意失敗」的卡片。** 自帶的 `config.xml` 分別用 `https://github.com/user/project2`（不存在的倉庫）和 `overwrite@2`（`overwrite.xml` 中沒有對應 `<id>`）示範兩種錯誤狀態——它們用來展示站點在倉庫寫錯或手動條目缺失時的表現，屬於預期行為，不是 bug。把它們刪掉，或改成你自己的條目即可。

> **用到手動條目時**，直接在 `overwrite.xml` 裡填寫條目即可——`docker-compose.yml` 已經把它掛載進容器了。
>
> 改完主機上的檔案後，點一下介面上的「立即檢查更新」就會生效，不需要重新建置容器。
>
> 注意保持檔案存在：若 `./overwrite.xml` 缺失，Docker 會把它建成一個空目錄，相關卡片會以 `EISDIR` 報錯。倉庫自帶一份可直接使用的範例，新複製的倉庫不受影響。

### 3. 建置並啟動

```bash
docker compose up -d --build
```

### 4. 開啟站點

瀏覽器前往 <http://localhost:8080>。

首次同步會在容器啟動時立即開始；之後每 24 小時同步一次（見 `CHECK_INTERVAL_HOURS`）。鏡像產物保存在主機的 `./data` 目錄中，重新啟動後依然保留。


### 不使用 Compose 直接執行

```bash
docker build -t biangbiang .
docker run -d --name biangbiang -p 8080:8080 \
  -v "$PWD/config.xml:/app/config.xml:ro" \
  -v "$PWD/assets:/app/assets:ro" \
  -v "$PWD/data:/app/data" \
  biangbiang
```

### 常用維運指令

```bash
docker compose logs -f          # 查看即時日誌
docker compose restart          # 重新啟動（會重新產生 PWA 圖示與應用程式名稱）
docker compose down             # 停止並移除容器
```

### 更新到最新版本

穩定版以標籤形式發佈。取回標籤、切到最新的 release 標籤，再重新建置容器：

```bash
git fetch --tags
git checkout "$(git tag --sort=-v:refname | head -1)"   # 最新的 release 標籤
docker compose up -d --build
```

> 檢出標籤後處於 detached HEAD 狀態，這對部署沒有影響。想固定在某個具體版本，把 `"$(...)"` 換成 `v1.0.2` 這樣的標籤名即可。

如果部署的是 **git 開發版**（`main` 分支），改用 `git pull` 即可：

```bash
git pull
docker compose up -d --build
```

`./config.xml`、`./overwrite.xml`、`./assets` 與 `./data` 都透過掛載保留在主機上，升級不會遺失它們。

---

## 本機開發

分別執行後端和 Vite 開發伺服器，以獲得熱更新。

```bash
# 終端機 1 —— 後端（鏡像到 ./data，提供 API 與檔案）
cd backend
npm install
CONFIG_PATH=../config.xml DATA_DIR=../data PUBLIC_DIR=../frontend/dist npm start

# 終端機 2 —— 前端開發伺服器（把 /api、/dl、/media 代理到 :8080）
cd frontend
npm install
npm run dev            # http://localhost:5173
```

常用指令稿：

```bash
cd backend  && npm run mirror   # 執行一次鏡像後結束
cd frontend && npm run build    # 建置生產版 SPA
cd frontend && npm run type-check
```

> 本機產生 PWA 圖示需要安裝 ImageMagick，詳見下文「PWA」一節。

---

## 環境變數

| 變數                    | 預設值                  | 說明 |
|-------------------------|-------------------------|------|
| `PORT`                  | `8080`                  | HTTP 埠。 |
| `HOST`                  | `0.0.0.0`               | 監聽位址。 |
| `TZ`                    | `Asia/Shanghai`         | 容器時區（IANA 名稱）。影響日誌與後端呈現的本機時間。可在 `docker-compose.yml` / `.env` 中修改。 |
| `CONFIG_PATH`           | `/app/config.xml`       | `config.xml` 的路徑。 |
| `DATA_DIR`              | `/app/data`             | 存放鏡像產物與 `state.json` 的目錄。 |
| `PUBLIC_DIR`            | `/app/public`           | 建置後的前端目錄。 |
| `CHECK_INTERVAL_HOURS`  | `24`                    | 輪詢 GitHub 新 Release 的間隔（小時）。 |
| `MIRROR_ON_START`       | `true`                  | 啟動時是否立即執行一次同步。 |
| `DOWNLOAD_CONCURRENCY`  | `4`                     | 每個專案並行下載的數量。 |
| `GITHUB_TOKEN`          | *（空）*                | 選用。提升 API 速率上限（60 → 5000 次/小時）。 |

這些變數都可以在 `docker-compose.yml` 的 `environment` 段落中設定。

---

## HTTP 介面

| 方法   | 路徑                                    | 說明 |
|--------|-----------------------------------------|------|
| `GET`  | `/api/state`                            | 目前站點狀態：標題、favicon、專案、版本與建置產物。 |
| `GET`  | `/api/health`                           | 健康檢查（存活探針）。 |
| `POST` | `/api/refresh`                          | 立即觸發一次鏡像（頁面上「立即檢查更新」按鈕使用）。 |
| `GET`  | `/media/{path}`                         | 相對設定目錄解析的 favicon / 專案圖示。 |
| `GET`  | `/dl/{owner}/{repo}/{version}/{file}`   | 下載鏡像後的建置產物。 |

> 上表中的 `{...}` 是佔位符，實際請求時請替換為具體值（例如 `{owner}` 換成倉庫擁有者）。本文件中只有 XML 標籤才寫作 `<...>`。

`GET /api/state` 回傳範例：

```json
{
  "title": "Page title",
  "lang": "zh_cn",
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

`status` 的取值：`ok`、`empty`（尚無 Release）或 `error`（例如倉庫不存在）。同步失敗的專案會保留上一次成功鏡像的內容。

---

## 說明

### 主題
主題預設為**跟隨系統（auto）**，跟隨作業系統的淺色/深色偏好，並在系統切換時即時更新。頁首的切換控制項允許強制使用**淺色**或**深色**，選擇會記錄在 `localStorage` 中。兩種主題均使用 Ant Design Vue 的 `defaultAlgorithm` / `darkAlgorithm` 設計權杖。

### PWA
應用程式附帶 `manifest.webmanifest` 與一個極簡的 Service Worker，因此可以安裝到主畫面/桌面。該 Service Worker **不做任何快取**——它是純網路透傳，因此依設計沒有離線模式。

可安裝的**應用程式圖示始終跟隨你的 `<favicon>`**，**應用程式名稱則始終跟隨 `<title>`**。每次啟動時，後端都會用 ImageMagick 由 favicon 衍生出整套圖示：

| 輸出 | 尺寸 | 說明 |
|------|------|------|
| `pwa-192x192.png` | 192×192 | 保留透明度，補齊為正方形 |
| `pwa-512x512.png` | 512×512 | 保留透明度，補齊為正方形 |
| `pwa-maskable-512x512.png` | 512×512 | 圖案縮放到 80%，背景填滿 favicon 的平均色 |
| `apple-touch-icon.png` | 180×180 | 平鋪到白色背景（iOS 不支援透明） |

圖示寫入 `{DATA_DIR}/pwa/`，並透過 manifest 中宣告的路徑對外提供。每次啟動時，後端還會在同一目錄重新產生 `manifest.webmanifest`，把其中的 `name` / `short_name`（即安裝後顯示的應用程式名稱）替換為 `config.xml` 裡的 `<title>`，並把 `lang` 設為 `<lang>` 對應的 BCP-47 標籤；其餘欄位（描述、配色、圖示清單）沿用前端建置產物中的範本。因此修改 `<favicon>`、`<title>` 或 `<lang>` 後重新啟動容器，即可更新可安裝圖示、應用程式名稱與語言。favicon 可以是 ImageMagick 能讀取的任意格式（PNG、WEBP 等）。若未設定 `<favicon>`，或系統中沒有 ImageMagick，則會改用 `frontend/public/` 中自帶的預設圖示；若 manifest 範本讀取失敗，則同樣回退到自帶的預設 manifest。

Docker 映像檔中已安裝 ImageMagick。本機開發時請自行安裝（`brew install imagemagick`、`apt install imagemagick` 等）。

### 速率限制
未認證的 GitHub API 請求限制為每小時 60 次，對於少量專案、每天輪詢一次來說綽綽有餘。如果設定的專案很多，請在 `docker-compose.yml` 中設定 `GITHUB_TOKEN`。

### 以非 root 使用者執行
容器的 entrypoint 會先以 root 啟動，把 `./data` 的擁有者改成 `node` 使用者（uid 1000），然後立刻降權執行——因此 bind mount 開箱即用，不需要手動 `chown`。如果你用 `user:` 或 `--user` 強制指定了其他使用者，則該使用者必須已經能寫入 `./data`。

---

## 授權條款

本專案基於 [The Unlicense](https://unlicense.org) 發佈，已進入公共領域（public domain）。你可以自由地複製、修改、發佈、使用、編譯、出售或散布本軟體，無論是原始碼形式還是編譯後的二進位形式，用於任何目的（商業或非商業），且無需署名。

完整條款見倉庫根目錄的 [LICENSE](LICENSE) 檔案。

