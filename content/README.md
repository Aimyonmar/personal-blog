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
| `cover_image` | 否 | 封面图地址。放在 `public/images/` 下时写 `/images/xxx.png`。 |
| `attachments` | 否 | 附件地址数组，页面底部会显示下载链接。文件放 `public/files/`。 |
| `read_time` | 否 | 阅读分钟数。缺省按中文 350 字/分钟、英文 220 词/分钟估算。 |

正文中的图片同样放在 `public/images/`，用 `/images/xxx.png` 引用，构建后会随站点一起发布，不会出现断图。

## 命令

```bash
npm run dev        # 本地开发，自动生成内容索引并监听 content/posts
npm run build      # 生成索引 → 类型检查 → 构建 → 输出 sitemap/rss/文章静态页
npm start          # 构建（如有变化）并启动本地生产预览
npm run test:server
npm run test:layout
```

## 为什么不用「网页编辑器写盘」

可选方案有两种：

- **直接写 Markdown 文件（当前方案）**：任何编辑器都能写，内容进 Git，可 diff、可回滚、可离线；代价是没有所见即所得的网页界面。
- **本地 dev server 提供写文件接口**：能在网页里编辑，但需要额外开一个只在本机可用的写入服务，处理并发保存、路径校验、文件权限和误覆盖，复杂度明显高于收益。

博客是单人写作，文件方式已经足够顺手，因此选择前者。需要草稿就先命名成 `_draft.md`。

## 部署到任意静态托管

`npm run build` 产出纯静态 `dist/`，不依赖任何云端接口。部署到自有域名或 GitHub Pages 时传入实际域名，让 sitemap / RSS / canonical / og:image 使用绝对地址：

```bash
PUBLIC_ORIGIN=https://your-domain.com npm run build
```

构建还会生成 `dist/404.html`，兼容 GitHub Pages 等静态托管的 SPA 回退；文章页会预生成 `dist/article/<slug>/index.html`，便于爬虫直接拿到文章级 meta。
