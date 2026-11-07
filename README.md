# 微光手记

一个纯静态的个人博客：文章是仓库里的 Markdown 文件，构建产物可以部署到任意静态托管。没有后台、没有登录、不连接任何云端接口，写作、构建、预览都可以离线完成。

## 功能

- 首页文章列表、标签筛选、文章详情、上下篇与相关文章
- 文章目录（TOC）、代码高亮与一键复制、GFM（表格、任务列表、删除线）
- 站内搜索（`Ctrl / ⌘ + K`），索引在浏览器内由本地正文构建
- 阅读偏好：亮/暗色主题、正文字号、行距，`localStorage` 持久化并跟随系统
- 构建时生成 `sitemap.xml`、`rss.xml`、`robots.txt`、文章级 meta 与静态文章页
- 零文章时首页、标签页、搜索、RSS、sitemap 都有明确的空状态或合法空 XML

## 技术栈

React 18 · TypeScript 5.7 · Vite 6 · React Router 7 · react-markdown · Vitest

## 快速开始

要求 Node.js 20 及以上。

```bash
npm ci
npm run dev
```

打开终端提示的地址（默认 `http://localhost:5173`）。`content/posts/` 下新增、修改、删除 Markdown 文件会自动刷新页面。

## 写文章

在 `content/posts/` 新建 `<slug>.md`，文件名就是文章地址：

```markdown
---
title: 文章标题
summary: 一句话摘要
tags: [工程实践, 前端]
published_at: 2026-11-07
updated_at: 2026-11-07
cover_image: /images/cover.png
attachments: [/files/slides.pdf]
read_time: 8
---

正文从这里开始。
```

完整字段说明、图片与附件放置方式、草稿约定见 [content/README.md](content/README.md)。

## 命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 生成内容索引并启动开发服务器（监听 `content/posts`） |
| `npm run build` | 生成索引 → 类型检查 → 构建 → 输出 SEO 文件到 `dist/` |
| `npm start` | 源码或内容有变化时构建，然后启动本地生产预览（默认 `:3000`） |
| `npm run preview` | 预览已有的 `dist/` |
| `npm run test:unit` | 单元测试（内容解析、搜索、SEO 输出、文章关系） |
| `npm run test:server` | 启动真实服务端，断言路由、缓存、gzip、sitemap/RSS |
| `npm run test:layout` | 用本机 Chrome/Edge 做 9 个视口的横向溢出检查 |

## 构建与部署

`npm run build` 会产出完整的静态站点 `dist/`，其中包含：

- `index.html`、`assets/`（前端资源）
- `sitemap.xml`、`rss.xml`、`robots.txt`
- `article/<slug>/index.html`（带文章级 meta，方便爬虫）
- `404.html`（SPA 回退，GitHub Pages 等静态托管直接可用）
- `og-default.png` 等 `public/` 下的静态资源

部署时传入实际站点地址，让 sitemap、RSS、canonical、og:image 使用绝对地址：

```bash
PUBLIC_ORIGIN=https://your-domain.com npm run build
```

把 `dist/` 上传到任意静态托管即可（Nginx、对象存储、Netlify、Vercel、Cloudflare Pages 等），不需要任何平台客户端。

### GitHub Pages

仓库已包含 [.github/workflows/pages.yml](.github/workflows/pages.yml)：推送到 `main` 后自动构建并发布。

首次使用时，在仓库 **Settings → Pages → Build and deployment** 把 Source 设为 **GitHub Actions** 即可。工作流会自动：

- 安装依赖并执行 `npm run build`
- 用 Pages 的实际地址设置 `PUBLIC_ORIGIN`
- 项目站点自动设置子路径 `PUBLIC_BASE`（如 `/personal-blog/`），用户站点则为 `/`

如果部署在子路径而不是域名根目录，本地构建时这样指定：

```bash
PUBLIC_ORIGIN=https://example.com/blog PUBLIC_BASE=/blog/ npm run build
```

## 目录结构

```text
content/
  README.md            写作说明
  posts/               文章 Markdown（文件名即 slug）
public/                静态资源（图片、附件、og 图）
scripts/
  content.mjs          frontmatter 解析、排序、校验
  build-content.mjs    生成前端使用的文章元数据
  blog-data.mjs        sitemap / RSS / 文章 meta 渲染
  postbuild.mjs        构建后输出静态 SEO 文件
  start.mjs            本地生产预览（按需构建）
  test-server.mjs      服务端回归测试
  check-layout.mjs     多视口布局回归
src/
  app/                 类型、页面 meta
  components/          布局、文章卡片、TOC、搜索、阅读偏好等
  features/            本地内容读取、搜索索引、偏好、文章关系
  pages/               首页、标签页、文章页、关于、404
  styles/              全局样式与主题变量
server.mjs             零依赖静态服务器 + 动态 SEO 路由
```

## 说明

- 访问站点不需要登录，也不会发起任何云端请求；`dist/` 可直接离线托管。
- `src/generated/posts.json` 是构建时生成的文章元数据，已加入 `.gitignore`，无需手动维护。
- `备份/` 是本地数据备份目录，默认不入库。
