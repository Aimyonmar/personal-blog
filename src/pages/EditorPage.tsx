import { FileUp, ImagePlus, LockKeyhole, PencilLine, Save, Send, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useNavigate, useParams } from 'react-router-dom'
import remarkGfm from 'remark-gfm'
import type { Article, Attachment } from '../app/types'
import { usePageMeta } from '../app/usePageMeta'
import { buildSlug, estimateReadTime } from '../features/articles/articleMetrics'
import { createArticle, getArticleBySlug, updateArticle } from '../features/articles/articleService'
import { useAuth } from '../features/auth/AuthProvider'
import {
  clearLocalDraft,
  editorDraftKey,
  formatSavedAt,
  readLocalDraft,
  writeLocalDraft,
  type LocalDraft,
} from '../features/editor/localDraft'
import { imageAltFromName, imageToMarkdownDataUrl, markdownImageSnippet } from '../features/editor/inlineImage'
import { formatFileSize, uploadBlogFile } from '../features/storage/storageService'

const STARTER_CONTENT = '# 从这里开始\n\n使用 **Markdown** 写下你的想法。\n\n- 记录问题\n- 写清过程\n- 留下结论'

export function EditorPage() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const { slug: editingSlug } = useParams()
  const isEditing = Boolean(editingSlug)

  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [tags, setTags] = useState('技术, 随笔')
  const [content, setContent] = useState(STARTER_CONTENT)
  const [status, setStatus] = useState<'draft' | 'published'>('published')
  const [cover, setCover] = useState<Attachment | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [loadingArticle, setLoadingArticle] = useState(isEditing)
  const [current, setCurrent] = useState<Article | null>(null)
  const [restoreCandidate, setRestoreCandidate] = useState<LocalDraft | null>(null)
  const [autoSavedAt, setAutoSavedAt] = useState(0)
  const [autoSaveFailed, setAutoSaveFailed] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const contentRef = useRef<HTMLTextAreaElement>(null)
  const dirtyRef = useRef(false)
  const latestRef = useRef({ title, summary, tags, content, status })
  latestRef.current = { title, summary, tags, content, status }

  usePageMeta({
    title: isEditing ? `编辑：${title || '文章'}` : '写一篇新文章',
    description: isEditing ? '修改并重新发布你的文章。' : '在微光手记的云端编辑器里用 Markdown 写一篇新文章。',
    path: isEditing ? `/write/${editingSlug}` : '/write',
  })

  const loadArticle = useCallback(async () => {
    if (!editingSlug) return
    setLoadingArticle(true)
    setMessage('')
    try {
      const article = await getArticleBySlug(editingSlug)
      if (!article) throw new Error('没有找到这篇文章，可能已被删除。')
      setCurrent(article)
      setTitle(article.title)
      setSummary(article.summary)
      setTags(article.tags.join(', '))
      setContent(article.content)
      setStatus(article.status)
      setCover(article.cover_image_path ? { name: '当前封面', path: article.cover_image_path, size: 0, type: 'image/*' } : null)
      setAttachments(article.attachments ?? [])
    } catch (loadError) {
      setMessage(loadError instanceof Error ? loadError.message : '文章读取失败。')
    } finally {
      setLoadingArticle(false)
    }
  }, [editingSlug])

  useEffect(() => { void loadArticle() }, [loadArticle])

  // 进入编辑器时读取本机草稿；不自动覆盖，交给用户决定是否恢复
  useEffect(() => {
    setRestoreCandidate(readLocalDraft(editorDraftKey(editingSlug)))
    setAutoSavedAt(0)
    setAutoSaveFailed(false)
    dirtyRef.current = false
  }, [editingSlug])

  // 输入停顿 500ms 后把当前内容写到本机，刷新或崩溃后可恢复
  useEffect(() => {
    if (!dirtyRef.current) return
    const key = editorDraftKey(editingSlug)
    const timer = window.setTimeout(() => {
      const saved = writeLocalDraft(key, { title, summary, tags, content, status })
      setAutoSaveFailed(!saved)
      if (saved) setAutoSavedAt(Date.now())
    }, 500)
    return () => window.clearTimeout(timer)
  }, [editingSlug, title, summary, tags, content, status])

  // 关闭页面前把最后不到 500ms 的输入也落盘
  useEffect(() => {
    const flush = () => {
      if (dirtyRef.current) writeLocalDraft(editorDraftKey(editingSlug), latestRef.current)
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [editingSlug])

  const applyRestore = () => {
    if (!restoreCandidate) return
    setTitle(restoreCandidate.title)
    setSummary(restoreCandidate.summary)
    setTags(restoreCandidate.tags)
    setContent(restoreCandidate.content)
    setStatus(restoreCandidate.status)
    setRestoreCandidate(null)
    setNotice('已恢复本机草稿，记得保存到云端。')
    dirtyRef.current = true
  }

  const discardRestore = () => {
    clearLocalDraft(editorDraftKey(editingSlug))
    setRestoreCandidate(null)
    setNotice('')
  }

  const insertAtCursor = (snippet: string) => {
    const element = contentRef.current
    const start = element?.selectionStart ?? content.length
    const end = element?.selectionEnd ?? content.length
    setContent(content.slice(0, start) + snippet + content.slice(end))
    dirtyRef.current = true
    window.requestAnimationFrame(() => {
      element?.focus()
      const position = start + snippet.length
      element?.setSelectionRange(position, position)
    })
  }

  const handleInlineImage = async (file: File) => {
    setImageBusy(true)
    setNotice('')
    setMessage('')
    try {
      const { dataUrl, bytes } = await imageToMarkdownDataUrl(file)
      insertAtCursor(markdownImageSnippet(imageAltFromName(file.name), dataUrl))
      setNotice(`已插入图片（约 ${Math.round(bytes / 1024)} KB），随正文一起保存。`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '图片处理失败。')
    } finally {
      setImageBusy(false)
    }
  }

  const tagList = useMemo(() => tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 8), [tags])

  if (authLoading) return <section className="content-section page-section"><p>正在确认登录状态…</p></section>
  if (!user) {
    return (
      <section className="editor-locked">
        <LockKeyhole size={30} />
        <span className="eyebrow">AUTHOR ONLY</span>
        <h1>登录后开始写作</h1>
        <p>请使用右上角登录入口完成手机号或微信登录。文章、封面和附件都会保存到云端。</p>
      </section>
    )
  }
  if (loadingArticle) return <section className="content-section page-section"><p>正在读取文章…</p></section>
  if (isEditing && current && current.owner_id && current.owner_id !== user.id) {
    return (
      <section className="editor-locked">
        <LockKeyhole size={30} />
        <span className="eyebrow">NOT YOUR ARTICLE</span>
        <h1>你只能编辑自己的文章</h1>
        <p>这篇文章属于另一个账号。你可以返回文章页阅读，或新建一篇自己的文章。</p>
      </section>
    )
  }

  const handleUpload = async (file: File, kind: 'covers' | 'attachments') => {
    setUploading(true)
    setMessage('')
    try {
      const uploaded = await uploadBlogFile(file, kind)
      if (kind === 'covers') setCover(uploaded)
      else setAttachments((items) => [...items, uploaded])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '上传失败。')
    } finally {
      setUploading(false)
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')
    if (!title.trim() || !summary.trim() || !content.trim()) {
      setMessage('标题、摘要和正文不能为空。')
      return
    }
    setBusy(true)
    try {
      const draft = {
        slug: current?.slug ?? buildSlug(title),
        title: title.trim(),
        summary: summary.trim(),
        content,
        tags: tagList,
        status,
        cover_image_path: cover?.path ?? null,
        attachments,
        read_time: estimateReadTime(content),
      }
      const article = current
        ? await updateArticle(current.slug, draft, current.published_at)
        : await createArticle(draft)
      clearLocalDraft(editorDraftKey(editingSlug))
      dirtyRef.current = false
      navigate(`/article/${article.slug}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '文章保存失败。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="editor-page">
      <div className="page-title-grid editor-title">
        <div>
          <span className="eyebrow">CLOUD EDITOR</span>
          <h1>{isEditing ? '编辑文章' : '写一篇新文章'}</h1>
        </div>
        <p>{isEditing
          ? '修改后保存会立即同步到云端，文章链接保持不变。'
          : '正文支持 GitHub Flavored Markdown。发布后的文章会立即出现在首页和标签分类中。'}</p>
      </div>

      {restoreCandidate && !loadingArticle && (
        <div className="draft-recovery" role="status">
          <div>
            <strong>发现未保存的本地草稿</strong>
            <span>保存于 {formatSavedAt(restoreCandidate.savedAt)}，可能是上次意外中断的内容。</span>
          </div>
          <div className="draft-recovery-actions">
            <button className="primary-button small-button" type="button" onClick={applyRestore}>恢复草稿</button>
            <button className="text-button-plain" type="button" onClick={discardRestore}>丢弃</button>
          </div>
        </div>
      )}

      <form className="editor-form" onSubmit={submit}>
        <div className="editor-fields">
          <label className="field"><span>文章标题</span><input value={title} onChange={(event) => { dirtyRef.current = true; setTitle(event.target.value) }} placeholder="一个清楚、具体的标题" maxLength={120} /></label>
          <label className="field"><span>文章摘要</span><textarea value={summary} onChange={(event) => { dirtyRef.current = true; setSummary(event.target.value) }} placeholder="用两三句话概括文章" rows={3} maxLength={300} /></label>
          <label className="field"><span>标签</span><input value={tags} onChange={(event) => { dirtyRef.current = true; setTags(event.target.value) }} placeholder="技术, 产品, 随笔" /></label>
          <label className="field"><span>Markdown 正文</span><textarea ref={contentRef} className="markdown-editor" value={content} onChange={(event) => { dirtyRef.current = true; setContent(event.target.value) }} spellCheck={false} /></label>
        </div>

        <aside className="editor-sidebar">
          <div className="editor-panel">
            <span className="panel-title">发布设置</span>
            <label className="field"><span>文章状态</span><select value={status} onChange={(event) => { dirtyRef.current = true; setStatus(event.target.value as 'draft' | 'published') }}><option value="published">公开发布</option><option value="draft">保存草稿</option></select></label>
            <span className="read-estimate">预计 {estimateReadTime(content)} 分钟阅读 · {content.length} 字符</span>
            <p className="status-note">
              {autoSaveFailed
                ? '本机自动保存失败（存储空间可能已满），请尽快保存到云端。'
                : autoSavedAt
                  ? `已自动保存到本机 · ${formatSavedAt(autoSavedAt)}`
                  : '编辑内容会自动保存到本机，刷新后可恢复。'}
            </p>
          </div>

          <div className="editor-panel">
            <span className="panel-title">云端文件</span>
            <label className="upload-button">
              <ImagePlus size={18} /> {cover ? '更换封面' : '上传封面'}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleUpload(file, 'covers') }} />
            </label>
            {cover && <div className="uploaded-file"><span>{cover.name}</span><button type="button" onClick={() => setCover(null)} aria-label="移除封面"><X size={15} /></button></div>}
            <label className="upload-button muted-upload">
              <FileUp size={18} /> 添加附件
              <input type="file" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleUpload(file, 'attachments') }} />
            </label>
            {attachments.map((item) => (
              <div className="uploaded-file" key={item.path}><span>{item.name}<small>{formatFileSize(item.size)}</small></span><button type="button" onClick={() => setAttachments((items) => items.filter((file) => file.path !== item.path))} aria-label={`移除${item.name}`}><X size={15} /></button></div>
            ))}
            <label className="upload-button muted-upload">
              <ImagePlus size={18} /> {imageBusy ? '正在处理图片…' : '插入正文图片'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={imageBusy || uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) void handleInlineImage(file)
                }}
              />
            </label>
            <p className="status-note">图片会压缩后直接写进正文，访客无需登录也能看到。</p>
            {uploading && <p className="status-note">正在上传到云端…</p>}
            {notice && <p className="status-note">{notice}</p>}
          </div>

          {message && <p className="field-error" role="alert">{message}</p>}
          <button className="primary-button full-button" type="submit" disabled={busy || uploading || imageBusy}>
            {isEditing ? <PencilLine size={17} /> : status === 'published' ? <Send size={17} /> : <Save size={17} />}
            {busy ? '正在保存…' : isEditing ? '保存修改' : status === 'published' ? '发布文章' : '保存草稿'}
          </button>
        </aside>
      </form>

      <section className="preview-section">
        <div className="preview-heading"><span className="eyebrow">LIVE PREVIEW</span><h2>Markdown 预览</h2></div>
        <div className="markdown-body preview-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></div>
      </section>
    </section>
  )
}
