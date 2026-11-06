import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
  plugins: [react()],
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
          if (/^(react-markdown|remark|micromark|mdast|hast|unist|unified|vfile)/.test(name)) return 'markdown'
          return 'vendor'
        },
      },
    },
  },
})
