/**
 * 把 content/posts/*.md 的元数据写入 src/generated/posts.json，供前端列表、标签页与搜索使用。
 * 没有文章时写入空数组；输出文件由 .gitignore 忽略，每次 dev/build 前重新生成。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadPosts, toMetadata } from './content.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'src', 'generated')
const outFile = path.join(outDir, 'posts.json')

export async function generateContent() {
  const posts = await loadPosts()
  const payload = posts.map(toMetadata)
  await mkdir(outDir, { recursive: true })
  await writeFile(outFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`[content] 已生成 ${path.relative(root, outFile)}：${payload.length} 篇文章`)
  return payload
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await generateContent()
}
