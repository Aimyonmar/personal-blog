import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ScrollToTop } from './components/ScrollToTop'
import { LoadingState } from './components/States'
import { HomePage } from './pages/HomePage'

const ArticlePage = lazy(() => import('./pages/ArticlePage').then((module) => ({ default: module.ArticlePage })))
const TagsPage = lazy(() => import('./pages/TagsPage').then((module) => ({ default: module.TagsPage })))
const SeriesPage = lazy(() => import('./pages/SeriesPage').then((module) => ({ default: module.SeriesPage })))
const AboutPage = lazy(() => import('./pages/AboutPage').then((module) => ({ default: module.AboutPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))

// 写作台只在 dev 注册；生产构建里 DEV 为 false，打包时整块分支和动态 import 都会被移除
const WriterPage = import.meta.env.DEV
  ? lazy(() => import('./dev/WriterPage').then((module) => ({ default: module.WriterPage })))
  : null

function RouteFallback() {
  return (
    <section className="content-section page-section">
      <LoadingState label="正在加载页面" />
    </section>
  )
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="article/:slug" element={<ArticlePage />} />
            <Route path="tags" element={<TagsPage />} />
            <Route path="series/:slug" element={<SeriesPage />} />
            <Route path="about" element={<AboutPage />} />
            {WriterPage && <Route path="write" element={<WriterPage />} />}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  )
}
