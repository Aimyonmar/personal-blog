export interface Attachment {
  name: string
  path: string
  size: number
  type: string
}

/** 来自 content/posts/*.md frontmatter 的文章元数据。 */
export interface PostMeta {
  slug: string
  /** 相对仓库根目录的源文件路径，如 content/posts/hello.md */
  file: string
  title: string
  summary: string
  tags: string[]
  published_at: string | null
  updated_at: string | null
  cover_image: string | null
  attachments: Attachment[]
  read_time: number
}

export type ArticleListItem = PostMeta

export interface Article extends PostMeta {
  content: string
}
