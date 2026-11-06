import { useMemo, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from './CodeBlock'

function heading(Tag: 'h2' | 'h3') {
  return function MarkdownHeading({ id, children }: { id?: string; children?: ReactNode }) {
    return (
      <Tag id={id}>
        {children}
        {id ? (
          <a className="heading-anchor" href={`#${id}`} aria-label="本节链接">
            #
          </a>
        ) : null}
      </Tag>
    )
  }
}

const components: Components = {
  img: ({ node: _node, ...props }) => <img {...props} loading="lazy" decoding="async" />,
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  h2: heading('h2'),
  h3: heading('h3'),
}

/** 文章正文：GitHub 风格 Markdown + 标题锚点 + 代码高亮与复制。 */
export function MarkdownArticle({ content }: { content: string }) {
  const plugins = useMemo(
    () => ({
      remark: [remarkGfm],
      rehype: [rehypeSlug, [rehypeHighlight, { detect: false, ignoreMissing: true }]] as never,
    }),
    [],
  )

  return (
    <div className="markdown-body" id="article-content">
      <ReactMarkdown remarkPlugins={plugins.remark} rehypePlugins={plugins.rehype} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
