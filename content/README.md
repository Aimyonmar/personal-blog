# 写作与内容说明

这个博客没有后台、没有登录，也不连接任何云端服务。每篇文章就是 `content/posts/` 里的一个 Markdown 文件。

## 写一篇新文章

1. 在 `content/posts/` 新建文件，文件名就是网址里的 slug，例如 `hello-world.md` → `/article/hello-world`。
   - 只允许字母、数字和连字符（中文文件名也能用，但会被 URL 编码，建议英文）。
   - 以 `_` 或 `.` 开头的文件（如 `_draft.md`）不会出现在站点里，可以当草稿暂存。
2. 文件开头写 frontmatter，下面是可直接复制的模板：

```markdown
---
title: 文章标题
summary: 一句话摘要，会用在首页卡片、搜索引擎和 RSS 里。
tags: [工程实践, 前端]
published_at: 2026-11-07
updated_at: 2026-11-07
cover_image: /images/cover.png
attachments: [/files/slides.pdf]
read_time: 8
---

正文从这里开始。

## 小标题

支持 GFM：表格、任务列表、删除线等。
```

3. 保存后，如果 `npm run dev` 正在运行，页面会自动刷新；创建、修改、删除文件都会生效。

## frontmatter 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 否 | 文章标题。缺省时用文件名。 |
| `summary` | 否 | 摘要。缺省时自动截取正文前 120 字。 |
| `tags` | 否 | 标签数组，支持 `[a, b]` 行内写法或多行 `- a` 写法。 |
| `published_at` | 建议 | 发布时间，`YYYY-MM-DD` 或 ISO 时间。缺省时排在列表最后。 |
| `updated_at` | 否 | 更新时间，缺省同发布时间；用于 sitemap 的 lastmod。 |
| `cover_image` | 否 | 封面图地址。图片放在 `content/images/` 下时写 `/images/xxx.png`。 |
| `attachments` | 否 | 附件地址数组，页面底部会显示下载链接。文件放 `public/files/`。 |
| `read_time` | 否 | 阅读分钟数。缺省按中文 350 字/分钟、英文 220 词/分钟估算。 |

正文中的图片放在 `content/images/`，用 `/images/xxx.png` 引用。`npm run dev` 时由本地写作台直接托管，`npm run build` 时会复制到 `dist/images/`，构建后随站点一起发布，不会出现断图。（`public/images/` 仍然可用，两处同名时 `content/images/` 优先。）

## 命令

```bash
npm run dev        # 本地开发，自动生成内容索引并监听 content/posts
npm run build      # 生成索引 → 类型检查 → 构建 → 输出 sitemap/rss/文章静态页
npm start          # 构建（如有变化）并启动本地生产预览
npm run test:server
npm run test:layout
```

## 本地写作台（仅开发环境）

`npm run dev` 启动后打开 `http://localhost:5173/write`（端口以终端输出为准），可以用表单写文章：

- 填标题、摘要、标签、发布时间，正文用 Markdown，右侧实时预览用的就是线上同一套 `MarkdownArticle` 渲染管线。
- Slug 默认由标题生成，也可以手动改；保存时写入 `content/posts/<slug>.md`，frontmatter 与手写文章完全一致。
- 默认「保存草稿」会写成 `_<slug>.md`，点「发布」才去掉下划线，转成正式文章。
- 正文区可以直接粘贴截图，或点「插入图片」选择文件；图片写到 `content/images/`，正文自动插入 `/images/xxx.png`。
- 左侧列出 `content/posts/` 下的全部文章（含草稿），点开即可继续编辑；有未保存修改时关闭页面会触发浏览器确认。

写作台只存在于 Vite dev server：写文件接口由仅 `apply: 'serve'` 的插件注册，生产构建里既没有这些接口，也没有 `/write` 路由。构建 / 部署仍然只读 Markdown 文件，不依赖任何云端服务。

## 为什么保留「直接写 Markdown 文件」

任何编辑器都能写，内容进 Git，可 diff、可回滚、可离线。网页写作台只是可选的便利入口，底层产物始终是普通 Markdown 文件。

## 部署到任意静态托管

`npm run build` 产出纯静态 `dist/`，不依赖任何云端接口。部署到自有域名或 GitHub Pages 时传入实际域名，让 sitemap / RSS / canonical / og:image 使用绝对地址：

```bash
PUBLIC_ORIGIN=https://your-domain.com npm run build
```

构建还会生成 `dist/404.html`，兼容 GitHub Pages 等静态托管的 SPA 回退；文章页会预生成 `dist/article/<slug>/index.html`，便于爬虫直接拿到文章级 meta。
