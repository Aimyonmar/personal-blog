import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { generateContent } from './scripts/build-content.mjs'

declare const process: { env: Record<string, string | undefined> }

/** 本地内容：构建前生成元数据；dev 下监听 content/ 变化并刷新页面。 */
function localContent(): Plugin {
  const isPost = (file: string) => file.replace(/\\/g, '/').includes('/content/posts/') && file.endsWith('.md')
  return {
    name: 'local-content',
    async buildStart() {
      await generateContent()
    },
    configureServer(server) {
      server.watcher.add('content/posts')
      const refresh = (file: string) => {
        if (!isPost(file)) return
        void generateContent().then(() => server.ws.send({ type: 'full-reload' }))
      }
      server.watcher.on('add', refresh)
      server.watcher.on('change', refresh)
      server.watcher.on('unlink', refresh)
    },
  }
}

const MARKDOWN_PACKAGES = new Set([
  'react-markdown',
  'remark-gfm',
  'remark-parse',
  'remark-rehype',
  'unified',
  'micromark',
  'mdast-util-gfm',
  'hast-util-to-jsx-runtime',
])

function packageName(id: string) {
  const segment = id.split('node_modules/').pop() ?? ''
  const parts = segment.split('/')
  return parts[0]?.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0] ?? ''
}

export default defineConfig({
  // 部署到子路径（如 GitHub Pages 项目站点）时用 PUBLIC_BASE 覆盖，例如 /my-blog/
  base: process.env.PUBLIC_BASE || '/',
  plugins: [react(), localContent()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          const name = packageName(id)
          if (name === 'lucide-react') return 'icons'
          if (name.startsWith('react-router')) return 'router'
          if (MARKDOWN_PACKAGES.has(name)) return 'markdown'
          if (name === 'react' || name === 'react-dom' || name === 'scheduler') return 'react'
          if (/^(react-markdown|remark|micromark|mdast|hast|unist|unified|vfile|rehype|lowlight|highlight\.js|github-slugger)/.test(name)) return 'markdown'
          return 'vendor'
        },
      },
    },
  },
})
