import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const read = async path => JSON.parse(await readFile(path, 'utf8'))
const save = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const data = await read('data/prompts.json')
let previous = { files: [] }
try { previous = await read('assets/manifest.json') } catch (error) { if (error.code !== 'ENOENT') throw error }
const assets = new Map(previous.files.map(file => [file.path, { ...file, promptIds: [] }]))
await mkdir('assets/previews', { recursive: true })
let cursor = 0
async function worker() {
  while (cursor < data.prompts.length) {
    const prompt = data.prompts[cursor++]
    const source = prompt.media.image
    if (!source.startsWith('https://')) {
      const entry = assets.get(source)
      if (!entry || hash(await readFile(source)) !== entry.sha256) throw new Error(`Missing or corrupt image: ${source}`)
      entry.promptIds.push(prompt.id)
      continue
    }
    const url = new URL(source)
    if (!['cdn-blog.holymolly.ai', 'cms.itripo3d.com'].includes(url.hostname)) throw new Error(`Unreviewed media host: ${url.hostname}`)
    let bytes
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(source, { signal: AbortSignal.timeout(30000), redirect: 'error' })
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${source}`)
        bytes = Buffer.from(await response.arrayBuffer())
        break
      } catch (error) { if (attempt === 2) throw error }
    }
    if (bytes.length > 5_000_000 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') throw new Error(`Unexpected media format: ${source}`)
    const sha256 = hash(bytes)
    const path = `assets/previews/${sha256.slice(0, 20)}.webp`
    await writeFile(path, bytes)
    const entry = assets.get(path) || { path, sourceUrl: source, sha256, bytes: bytes.length, promptIds: [] }
    entry.promptIds.push(prompt.id)
    assets.set(path, entry)
    prompt.media.image = path
  }
}
await Promise.all(Array.from({ length: 4 }, worker))
await save('data/prompts.json', data)
await save('assets/manifest.json', { schemaVersion: 1, note: 'Source preview files only. Creator attribution is in data/prompts.json. The conceptual hero is not a source example.', files: [...assets.values()].filter(file => file.promptIds.length).sort((a, b) => a.path.localeCompare(b.path)) })
const manifest = await read('data/manifest.json')
for (const file of manifest.files) {
  const bytes = await readFile(file.path)
  file.sha256 = hash(bytes)
  file.bytes = bytes.length
}
await save('data/manifest.json', manifest)
console.log(`Vendored ${data.prompts.length} previews into ${assets.size} deduplicated WebP files.`)
