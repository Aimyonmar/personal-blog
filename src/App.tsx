import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ScrollToTop } from './components/ScrollToTop'
import { LoadingState } from './components/States'
import { HomePage } from './pages/HomePage'

const ArticlePage = lazy(() => import('./pages/ArticlePage').then((module) => ({ default: module.ArticlePage })))
const EditorPage = lazy(() => import('./pages/EditorPage').then((module) => ({ default: module.EditorPage })))
const TagsPage = lazy(() => import('./pages/TagsPage').then((module) => ({ default: module.TagsPage })))
const AboutPage = lazy(() => import('./pages/AboutPage').then((module) => ({ default: module.AboutPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))

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
            <Route path="about" element={<AboutPage />} />
            <Route path="write" element={<EditorPage />} />
            <Route path="write/:slug" element={<EditorPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  )
}
