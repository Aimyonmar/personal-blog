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
  /** 所属系列名；未填为 null。大小写与空白差异视为同一系列。 */
  series: string | null
  /** 系列内序号；未填或非法值为 null，排序时排在有序号的篇目之后。 */
  series_order: number | null
}

export type ArticleListItem = PostMeta

export interface Article extends PostMeta {
  content: string
}
