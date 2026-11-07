import { CloudUpload, ImagePlus, Plus, RefreshCw, Save, Send } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
} from 'react'
import { MarkdownArticle } from '../components/MarkdownArticle'
import {
  writerApi,
  type PublishPlan,
  type PublishRequest,
  type SaveResult,
  type WriterPostSummary,
} from './writerApi'

const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const SLUG_RE = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u

interface EditorForm {
  title: string
  slug: string
  summary: string
  tags: string
  series: string
  seriesOrder: string
  publishedAt: string
  body: string
  published: boolean
}

function todayLocal() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function emptyForm(): EditorForm {
  return {
    title: '',
    slug: '',
    summary: '',
    tags: '',
    series: '',
    seriesOrder: '',
    publishedAt: todayLocal(),
    body: '',
    published: false,
  }
}

/** 由标题生成 slug：保留中英文与数字，其余字符折叠成连字符。 */
function slugify(title: string) {
  const base = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return base || `post-${todayLocal().replace(/-/g, '')}`
}

function splitTags(value: string) {
  return [...new Set(value.split(/[,，、]/).map((tag) => tag.trim()).filter(Boolean))]
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请重试'
}

export function WriterPage() {
  const [form, setForm] = useState<EditorForm>(emptyForm)
  const [snapshot, setSnapshot] = useState(() => JSON.stringify(emptyForm()))
  const [originalFile, setOriginalFile] = useState<string | null>(null)
  const [posts, setPosts] = useState<WriterPostSummary[]>([])
  const [slugTouched, setSlugTouched] = useState(false)
  const [listLoading, setListLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [uploadedImages, setUploadedImages] = useState<string[]>([])
  const [removedFiles, setRemovedFiles] = useState<string[]>([])
  const [pendingPublish, setPendingPublish] = useState<{ request: PublishRequest; plan: PublishPlan } | null>(null)
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const dirty = useMemo(() => JSON.stringify(form) !== snapshot, [form, snapshot])
  const draftFile = `${form.published ? '' : '_'}${form.slug || 'draft'}.md`

  const refreshList = useCallback(async () => {
    setListLoading(true)
    try {
      const result = await writerApi.list()
      setPosts(result.posts)
    } catch (error) {
      setStatus({ kind: 'error', text: errorMessage(error) })
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshList()
  }, [refreshList])

  // 关闭 / 刷新页面时，如果还有未保存的修改就交给浏览器确认
  useEffect(() => {
    if (!dirty) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

  function confirmDiscard() {
    return !dirty || window.confirm('当前修改还没有保存，确定要离开吗？')
  }

  function startNew() {
    if (!confirmDiscard()) return
    const next = emptyForm()
    setForm(next)
    setSnapshot(JSON.stringify(next))
    setOriginalFile(null)
    setSlugTouched(false)
    setUploadedImages([])
    setRemovedFiles([])
    setPendingPublish(null)
    setStatus(null)
  }

  async function openPost(file: string) {
    if (!confirmDiscard()) return
    setBusy(true)
    try {
      const post = await writerApi.read(file)
      const next: EditorForm = {
        title: post.title,
        slug: post.slug,
        summary: post.summary,
        tags: post.tags.join(', '),
        series: post.series,
        seriesOrder: post.seriesOrder,
        publishedAt: post.publishedAt || todayLocal(),
        body: post.body,
        published: !post.draft,
      }
      setForm(next)
      setSnapshot(JSON.stringify(next))
      setOriginalFile(post.file)
      setSlugTouched(true)
      setUploadedImages([])
      setRemovedFiles([])
      setPendingPublish(null)
      setStatus({ kind: 'ok', text: `已打开 content/posts/${post.file}` })
    } catch (error) {
      setStatus({ kind: 'error', text: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  function insertMarkdown(snippet: string) {
    const textarea = textareaRef.current
    const start = textarea?.selectionStart ?? form.body.length
    const end = textarea?.selectionEnd ?? start
    setForm((prev) => ({ ...prev, body: `${prev.body.slice(0, start)}${snippet}${prev.body.slice(end)}` }))
    requestAnimationFrame(() => {
      const element = textareaRef.current
      if (!element) return
      const position = start + snippet.length
      element.focus()
      element.setSelectionRange(position, position)
    })
  }

  async function uploadFiles(files: File[]) {
    if (!files.length) return
    setUploading(true)
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          setStatus({ kind: 'error', text: `${file.name} 不是图片文件` })
          continue
        }
        if (file.size > MAX_IMAGE_BYTES) {
          setStatus({ kind: 'error', text: `${file.name} 超过 6 MB` })
          continue
        }
        const dataUrl = await readAsDataUrl(file)
        const result = await writerApi.upload(dataUrl)
        const alt = file.name.replace(/\.[^.]+$/, '') || '图片'
        insertMarkdown(`![${alt}](${result.path})`)
        setUploadedImages((prev) => (prev.includes(result.path) ? prev : [...prev, result.path]))
        setStatus({ kind: 'ok', text: `图片已写入 content${result.path}` })
      }
    } catch (error) {
      setStatus({ kind: 'error', text: errorMessage(error) })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
    if (files.length === 0) return
    event.preventDefault()
    void uploadFiles(files)
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    void uploadFiles(Array.from(event.target.files ?? []))
  }

  async function handleSave(publish: boolean): Promise<SaveResult | null> {
    const title = form.title.trim()
    const slug = form.slug.trim()
    if (!title) {
      setStatus({ kind: 'error', text: '请先填写标题' })
      return null
    }
    if (!slug || !SLUG_RE.test(slug)) {
      setStatus({ kind: 'error', text: 'Slug 只允许字母、数字与连字符（不能以下划线或点开头）' })
      return null
    }
    if (!form.body.trim()) {
      setStatus({ kind: 'error', text: '正文不能为空' })
      return null
    }

    setBusy(true)
    try {
      const result = await writerApi.save({
        file: originalFile,
        slug,
        title,
        summary: form.summary,
        tags: splitTags(form.tags),
        series: form.series,
        seriesOrder: form.seriesOrder,
        publishedAt: form.publishedAt,
        body: form.body,
        publish,
      })
      const next: EditorForm = { ...form, slug: result.slug, published: publish }
      setForm(next)
      setSnapshot(JSON.stringify(next))
      setOriginalFile(result.file)
      setSlugTouched(true)

      const previous = result.previousFile
      if (previous && previous !== result.file) {
        setRemovedFiles((prev) => (prev.includes(previous) ? prev : [...prev, previous]))
      }

      setStatus({
        kind: 'ok',
        text: publish ? `已发布 content/posts/${result.file}` : `草稿已保存 content/posts/${result.file}`,
      })
      await refreshList()
      return result
    } catch (error) {
      setStatus({ kind: 'error', text: errorMessage(error) })
      return null
    } finally {
      setBusy(false)
    }
  }

  /** 先把当前表单保存为正式文章，再向服务端要一份提交清单供用户确认。 */
  async function handlePlanPublish() {
    if (busy || pushing) return
    setPendingPublish(null)

    let file = originalFile
    if (!file || dirty || !form.published) {
      const result = await handleSave(true)
      if (!result) return
      file = result.file
    }
    if (!file) return

    setPushing(true)
    try {
      const request: PublishRequest = { file, images: uploadedImages, removed: removedFiles }
      const plan = await writerApi.planPublish(request)
      setPendingPublish({ request, plan })
      setStatus({ kind: 'ok', text: `将要提交 ${plan.files.length} 个文件，请确认后推送。` })
    } catch (error) {
      setStatus({ kind: 'error', text: errorMessage(error) })
    } finally {
      setPushing(false)
    }
  }

  async function confirmPublish() {
    if (!pendingPublish || pushing) return
    setPushing(true)
    try {
      const result = await writerApi.publish(pendingPublish.request)
      setPendingPublish(null)
      setUploadedImages([])
      setRemovedFiles([])
      setStatus({
        kind: 'ok',
        text: `已推送到 origin/main：${result.commit}（${result.files.length} 个文件），GitHub Pages 将自动更新。`,
      })
      await refreshList()
    } catch (error) {
      setStatus({ kind: 'error', text: errorMessage(error) })
    } finally {
      setPushing(false)
    }
  }

  return (
    <section className="content-section page-section writer-page">
      <header className="writer-header">
        <div>
          <span className="eyebrow">LOCAL WRITER · DEV ONLY</span>
          <h1>写作台 <em>手记</em></h1>
          <p>只在 npm run dev 下存在。保存会直接写入 content/posts，不联网、不登录、不经任何第三方服务。</p>
        </div>
        <div className="writer-header-actions">
          <button className="text-button" type="button" onClick={startNew} disabled={busy}>
            <Plus size={16} /> 新建
          </button>
          <button className="text-button" type="button" onClick={() => void refreshList()} disabled={busy || listLoading}>
            <RefreshCw size={16} /> 刷新列表
          </button>
        </div>
      </header>

      {status && (
        <p className={status.kind === 'ok' ? 'writer-status is-ok' : 'writer-status is-error'} role="status">
          {status.text}
        </p>
      )}

      {pendingPublish && (
        <div className="writer-publish-panel">
          <div className="writer-publish-head">
            <strong>确认提交并推送</strong>
            <span>
              分支 {pendingPublish.plan.branch} · {pendingPublish.plan.commitMessage}
            </span>
          </div>
          <ul>
            {pendingPublish.plan.files.map((file) => (
              <li key={file.path}>
                <code>{file.path}</code>
                <em>{file.status}</em>
              </li>
            ))}
          </ul>
          <div className="writer-publish-actions">
            <button className="writer-push" type="button" onClick={() => void confirmPublish()} disabled={pushing}>
              <CloudUpload size={16} /> {pushing ? '推送中…' : '确认提交并推送'}
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setPendingPublish(null)}
              disabled={pushing}
            >
              取消
            </button>
          </div>
          <p className="writer-hint">只会提交上面列出的文件；不会执行 git add -A，也不会 force-push / reset。</p>
        </div>
      )}

      <div className="writer-grid">
        <aside className="writer-sidebar">
          <div className="writer-panel-head">
            <h2>文章</h2>
            <span>{posts.length}</span>
          </div>
          {listLoading ? (
            <p className="writer-hint">正在读取 content/posts……</p>
          ) : posts.length === 0 ? (
            <p className="writer-hint">还没有文章，从右侧写第一篇。</p>
          ) : (
            <ul className="writer-post-list">
              {posts.map((post) => (
                <li key={post.file}>
                  <button
                    type="button"
                    className={`writer-post-item${post.file === originalFile ? ' is-active' : ''}`}
                    onClick={() => void openPost(post.file)}
                    disabled={busy}
                  >
                    <span className="writer-post-title">{post.title}</span>
                    <span className="writer-post-meta">
                      <em className={post.draft ? 'is-draft' : undefined}>{post.draft ? '草稿' : '已发布'}</em>
                      {post.updated_at || post.published_at}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="writer-editor">
          <div className="writer-panel-head">
            <h2>{originalFile ? '编辑' : '新建'}</h2>
            <span>{originalFile ?? draftFile}</span>
          </div>

          <div className="writer-fields">
            <label>
              标题
              <input
                type="text"
                value={form.title}
                maxLength={200}
                placeholder="文章标题"
                onChange={(event) => {
                  const title = event.target.value
                  setForm((prev) => ({
                    ...prev,
                    title,
                    slug: slugTouched ? prev.slug : slugify(title),
                  }))
                }}
              />
            </label>

            <label>
              Slug
              <input
                type="text"
                value={form.slug}
                maxLength={64}
                placeholder="hello-world"
                onChange={(event) => {
                  setSlugTouched(true)
                  setForm((prev) => ({ ...prev, slug: event.target.value }))
                }}
              />
              <small>/article/{form.slug || '…'} · 文件名 {form.slug || '…'}.md</small>
            </label>

            <label>
              摘要
              <textarea
                rows={2}
                value={form.summary}
                maxLength={600}
                placeholder="一句话摘要，会用在首页卡片、搜索与 RSS 里"
                onChange={(event) => setForm((prev) => ({ ...prev, summary: event.target.value }))}
              />
            </label>

            <div className="writer-field-row">
              <label>
                标签
                <input
                  type="text"
                  value={form.tags}
                  placeholder="工程实践, 前端"
                  onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
                />
              </label>
              <label>
                发布时间
                <input
                  type="date"
                  value={form.publishedAt}
                  onChange={(event) => setForm((prev) => ({ ...prev, publishedAt: event.target.value }))}
                />
              </label>
            </div>

            <div className="writer-field-row">
              <label>
                系列（可选）
                <input
                  type="text"
                  value={form.series}
                  maxLength={80}
                  placeholder="例如：把博客搬回自己手里"
                  onChange={(event) => setForm((prev) => ({ ...prev, series: event.target.value }))}
                />
                <small>填写后文章页会显示系列导航，并生成 /series/… 系列页；留空不影响现有行为。</small>
              </label>
              <label>
                系列序号（可选）
                <input
                  type="number"
                  min={0}
                  max={9999}
                  value={form.seriesOrder}
                  placeholder="1"
                  onChange={(event) => setForm((prev) => ({ ...prev, seriesOrder: event.target.value }))}
                />
                <small>决定系列内顺序；留空会排在有序号的篇目之后。</small>
              </label>
            </div>
          </div>

          <div className="writer-body-head">
            <span>正文 · Markdown</span>
            <button
              className="text-button"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || busy}
            >
              <ImagePlus size={15} /> {uploading ? '上传中…' : '插入图片'}
            </button>
          </div>

          <textarea
            ref={textareaRef}
            className="writer-body"
            value={form.body}
            spellCheck={false}
            placeholder={'正文从这里开始。\n\n## 小标题\n\n支持 GFM；也可以直接把截图粘贴进来。'}
            onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
            onPaste={handlePaste}
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
            multiple
            hidden
            onChange={handleFileChange}
          />

          <div className="writer-actions">
            <button className="text-button" type="button" onClick={() => void handleSave(false)} disabled={busy}>
              <Save size={16} /> {form.published ? '转为草稿' : '保存草稿'}
            </button>
            <button className="writer-publish" type="button" onClick={() => void handleSave(true)} disabled={busy || pushing}>
              <Send size={16} /> {form.published ? '更新发布' : '发布'}
            </button>
            <button className="writer-push" type="button" onClick={() => void handlePlanPublish()} disabled={busy || pushing}>
              <CloudUpload size={16} /> {pushing ? '处理中…' : '推送上线'}
            </button>
            <span className={dirty ? 'writer-dirty is-dirty' : 'writer-dirty'}>{dirty ? '有未保存的修改' : '已同步'}</span>
          </div>
          <p className="writer-hint writer-push-hint">
            「推送上线」会先把当前内容保存为正式文章，再只提交本文与本次上传的图片到 origin/main；草稿只留在本地，不会被推送。
          </p>
        </div>

        <div className="writer-preview">
          <div className="writer-panel-head">
            <h2>实时预览</h2>
            <span>{form.slug ? `/article/${form.slug}` : '未命名'}</span>
          </div>
          <div className="writer-preview-body">
            {form.title && <h1 className="writer-preview-title">{form.title}</h1>}
            {form.summary && <p className="writer-preview-summary">{form.summary}</p>}
            {form.body.trim() ? (
              <MarkdownArticle content={form.body} />
            ) : (
              <p className="writer-hint">在左侧正文里开始写，这里会用线上同一套 Markdown 渲染管线实时显示。</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
