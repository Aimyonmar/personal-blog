import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

function upsertMeta(selector: string, attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.appendChild(element)
  }
  element.setAttribute('content', content)
}

export const SITE_NAME = '微光手记'
/** 当前站点 origin：本地预览与任意静态托管上都以实际访问地址为准。 */
const SITE_URL = typeof window === 'undefined' ? '' : window.location.origin
/** 部署在子路径时，BASE_URL 带首尾斜杠（如 `/blog/`）；拼进 URL 前去掉尾部斜杠，避免出现 `//`。 */
const BASE_PATH = import.meta.env.BASE_URL.replace(/\/+$/, '')

export function usePageMeta(options: { title: string; description?: string; path?: string }) {
  const { title, description, path } = options
  useEffect(() => {
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`
    document.title = fullTitle
    upsertMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle)
    upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle)
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', `${SITE_URL}${BASE_PATH}${path ?? '/'}`)
    if (description) {
      upsertMeta('meta[name="description"]', 'name', 'description', description)
      upsertMeta('meta[property="og:description"]', 'property', 'og:description', description)
      upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description)
    }
  }, [description, path, title])
}

export function useScrollToTopOnNavigate() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname])
}
