# 拾韵 · 每日一词

> 一个纯静态、零依赖、开箱即用的**古诗词在线检索站**。
> 打开即见「每日一词」，输入即可在数万首唐宋诗词中极速检索。

**在线体验**：本地双击 `index.html` 即可运行，或部署到任意静态服务器。

---

## 目录

- [功能特性](#-功能特性)
- [数据来源](#-数据来源)
- [快速开始](#-快速开始)
- [Docker 部署](#-docker-部署推荐)
- [配置说明](#-配置说明)
- [工作原理](#-工作原理)
- [常见问题](#-常见问题)
- [目录结构](#-目录结构)

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| **每日一词** | 按日期确定性轮换，同一天所有人看到同一首，次日自动更换 |
| **诗词搜索** | 支持按 **诗名 / 词牌 / 作者 / 名句片段** 实时过滤，多关键词空格分隔取交集 |
| **朝代筛选** | 先秦 · 汉魏 · 唐 · 宋 · 元 · 清 一键切换 |
| **分页浏览** | 每页 24 首，完整翻页浏览全部已加载作品 |
| **详情弹窗** | 点击卡片查看全篇，一键复制到剪贴板 |
| **繁简兼容** | 内置 OpenCC 繁简转换，简体关键词可直接命中繁体文本 |
| **本地秒开** | 全量数据缓存于浏览器 IndexedDB，二次打开零网络请求 |
| **断点续传** | 宋词分卷下载，中途关闭页面后下次仅补缺失部分 |
| **多源容错** | 自动在 jsDelivr / Fastly / Gcore / Statically 四个镜像间切换 |

## 📊 数据来源

全部诗词来自开源数据库 [chinese-poetry/chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)，
通过 jsDelivr 系列公共 CDN 分发，本站不存储任何诗词文件。

| 收录内容 | 数量 | 备注 |
|----------|------|------|
| 唐诗三百首 | 约 310 首 | 繁体原文，检索时自动转简 |
| 诗经 | 305 首 | |
| 楚辞 | 40 余篇 | |
| 曹操诗集 | 26 首 | |
| 纳兰词 | 约 300 首 | |
| 元曲 | 700 余首 | |
| **宋词全卷** | **21050 首** | 含李清照、辛弃疾、苏轼、柳永、欧阳修等两宋全部词人 |

合计约 **2.2 万余首**，首次完整加载约 15 MB（CDN gzip 压缩后实际传输更少）。

---

## 🚀 快速开始

无需安装任何东西：

```bash
# 方式一：直接双击 index.html 用浏览器打开

# 方式二：起一个本地静态服务（可选）
python -m http.server 8080
# 访问 http://localhost:8080
```

> 首次打开约 1~2 秒呈现「每日一词」与核心诗集，宋词在后台静默加载；
> 之后每次打开均由本地缓存直接渲染，瞬时完成。

---

## 🐳 Docker 部署（推荐）

适合云服务器长期运行。镜像基于 `nginx:alpine`，已开启 gzip 压缩与静态资源缓存。

### 方式一：docker compose（推荐）

```bash
git clone https://github.com/dll315/shiyun.git
cd shiyun
docker compose up -d --build
```

### 方式二：原生 docker 命令

```bash
git clone https://github.com/dll315/shiyun.git
cd shiyun
docker build -t shiyun .
docker run -d --name shiyun-poetry \
  -p 5234:80 \
  --restart unless-stopped \
  shiyun
```

### 验证

```bash
curl -I http://localhost:5234
# HTTP/1.1 200 OK  即部署成功
```

浏览器访问 `http://服务器IP:5234` 即可使用。

### 更新版本

```bash
cd shiyun
git pull
docker compose up -d --build
```

---

## ⚙️ 配置说明

### 更换端口

编辑 `docker-compose.yml` 中映射的宿主机端口即可：

```yaml
ports:
  - "8080:80"    # 左边是宿主机端口，右边容器内固定为 80
```

或使用 run 命令时调整 `-p 宿主机端口:80`。

### 常用运维命令

```bash
docker logs shiyun-poetry        # 查看日志
docker restart shiyun-poetry     # 重启
docker rm -f shiyun-poetry       # 删除容器
docker rmi shiyun                # 删除镜像
```

### 浏览器端数据缓存

访客的诗词数据保存在浏览器 **IndexedDB**（键名 `shiyun-corpus-v4`）中：

- 清除方法：开发者工具 → Application → IndexedDB → 删除 `shiyun-db`
- 站点发布新数据结构时会自动升级缓存键版本，无需用户手动清理

---

## 🔍 工作原理

```
浏览器打开页面
   │
   ├─ 读取 IndexedDB 缓存 ──命中──▶ 直接渲染（毫秒级）
   │        │ 未命中
   │        ▼
   ├─ 并行拉取核心诗集（唐诗三百首/诗经/楚辞…）──▶ 渲染「每日一词」
   │
   ├─ 后台加载 OpenCC 繁简转换库（不阻塞页面）
   │
   └─ 分卷并发拉取 22 卷宋词（每卷千首）──▶ 进度条展示，边下边可搜
            │
            ▼
      每 5 卷自动写入 IndexedDB（断点续传）
```

- **搜索匹配**：对标题 / 作者 / 正文建立小写化指纹索引（含繁→简归一），毫秒级过滤
- **每日一词算法**：`seed = 年份×1000 + 年内天数`，经哈希散列映射到精选池（唐诗三百首、诗经等约千首名篇），保证同日一致、跨日轮换
- **镜像容错**：所有请求依次尝试 jsDelivr → Fastly → Gcore → Statically，成功的镜像会被记住优先复用

---

## ❓ 常见问题

<details>
<summary><b>首次打开很慢 / 加载失败？</b></summary>

本站依赖 jsDelivr 系公共 CDN。若所在网络环境访问不佳，程序会自动尝试四个镜像；
仍失败时可尝试更换网络环境。核心诗集失败会给出明确提示，修复网络后刷新即可续传。
</details>

<details>
<summary><b>为什么每日一词和搜索结果不完全同步？</b></summary>

「每日一词」取自约千首名篇精选池，保证质量且与宋词后台加载进度无关；
搜索范围则是当前已加载的全部作品，随宋词分卷到达而扩大至 2.2 万首。
</details>

<details>
<summary><b>支持手机访问吗？</b></summary>

支持。响应式布局，移动端自动调整为单列排版。
</details>

<details>
<summary><b>需要后端 / 数据库吗？</b></summary>

不需要。纯前端实现，任何能托管静态文件的环境均可运行（nginx、Caddy、对象存储 + CDN、GitHub Pages 等）。
</details>

---

## 📁 目录结构

```
shiyun/
├── index.html          # 页面入口（单页）
├── css/style.css       # 古典水墨风格样式
├── js/app.js           # 全部逻辑：数据加载 / 检索 / 分页 / 缓存
├── nginx.conf          # 容器内 nginx 配置（gzip + 缓存头）
├── Dockerfile          # nginx:alpine 静态站点镜像
├── docker-compose.yml  # 一键编排（端口 5234:80）
└── .dockerignore / .gitignore
```

## 🛠 技术栈

- 前端：原生 HTML5 + CSS3 + JavaScript（ES2020），无框架、无构建步骤、零 npm 依赖
- 字体：Google Fonts（Ma Shan Zheng 书法体 / Noto Serif SC），离线环境自动回退系统楷体
- 服务端：nginx（alpine 镜像，体积约 25 MB）

## 📄 许可

- 站点代码：[MIT](https://opensource.org/licenses/MIT)
- 诗词数据：版权归原作者 [chinese-poetry](https://github.com/chinese-poetry/chinese-poetry) 所有，仅供学习欣赏

---

<p align="center">腹有诗书气自华 · 愿你每天都与一首好诗词相遇</p>
