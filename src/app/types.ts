export interface Attachment {
  name: string
  path: string
  size: number
  type: string
}

export interface Article {
  id: number
  owner_id: string | null
  slug: string
  title: string
  summary: string
  content: string
  tags: string[]
  status: 'draft' | 'published'
  cover_image_path: string | null
  attachments: Attachment[]
  read_time: number
  published_at: string | null
  created_at: string
  updated_at: string
}

export type ArticleListItem = Omit<Article, 'content' | 'attachments'>

export interface ArticleDraft {
  slug: string
  title: string
  summary: string
  content: string
  tags: string[]
  status: 'draft' | 'published'
  cover_image_path?: string | null
  attachments?: Attachment[]
  read_time: number
  published_at?: string | null
}

export interface AuthUser {
  id: string
  email?: string
  phone?: string
  phoneNumber?: string
  name?: string
}

export interface AuthSession {
  user: AuthUser
}
