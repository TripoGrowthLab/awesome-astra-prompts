import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'

export const hash = bytes => createHash('sha256').update(bytes).digest('hex')
export const json = value => JSON.stringify(value, null, 2) + '\n'
const extensions = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' }
async function cached(file) {
  if (!file || !/^assets\/(previews\/[a-f0-9]{64}\.(webp|jpg|png|gif)|featured\/[a-z0-9-]+\.webp)$/.test(file.path)) return null
  try { const bytes = await readFile(file.path); return hash(bytes) === file.sha256 ? bytes : null } catch { return null }
}
export async function readManifest() {
  try { return JSON.parse(await readFile('assets/manifest.json', 'utf8')) } catch (error) { if (error.code === 'ENOENT') return { files: [] }; throw error }
}

export async function prepareMedia(prompts, cms, previous = { files: [] }) {
  const output = new Map(), records = new Map(), mediaJobs = new Map()
  const old = new Map(previous.files.map(file => [file.fingerprint, file]))
  for (const prompt of prompts) for (const media of prompt.media) {
    const fingerprint = hash(JSON.stringify([media.url, media.updatedAt, media.filesize]))
    mediaJobs.set(fingerprint, { media, fingerprint })
  }
  const queue = [...mediaJobs.values()]
  let next = 0, completed = 0
  // Wait for all workers before returning a failure; no outstanding write/network work.
  const workers = await Promise.allSettled(Array.from({ length: 4 }, async () => {
    while (next < queue.length) {
      const { media, fingerprint } = queue[next++]
      let bytes = await cached(old.get(fingerprint))
      if (!bytes) {
        const response = await cms.request(media.url, { media: true })
        assert.equal(response.headers.get('content-type')?.split(';')[0], media.mimeType, 'CMS image MIME mismatch')
        const chunks = []; let length = 0
        for await (const chunk of response.body) {
          length += chunk.length
          assert(length <= media.filesize, 'CMS image exceeded its declared size')
          chunks.push(chunk)
        }
        bytes = Buffer.concat(chunks)
      }
      assert.equal(bytes.length, media.filesize, 'Truncated CMS image')
      const metadata = await sharp(bytes).metadata()
      assert(metadata.width && metadata.height && ['webp', 'jpeg', 'png', 'gif'].includes(metadata.format), 'Invalid image bytes')
      const sha256 = hash(bytes), path = `assets/previews/${sha256}.${extensions[media.mimeType]}`
      output.set(path, bytes)
      records.set(fingerprint, { path, fingerprint, sha256, bytes: bytes.length, sourceUrl: media.source, promptIds: [] })
      completed++
      if (completed % 25 === 0 || completed === queue.length) console.log(`Verified ${completed}/${queue.length} CMS images`)
    }
  }))
  for (const worker of workers) if (worker.status === 'rejected') throw worker.reason
  for (const prompt of prompts) {
    prompt.images = prompt.media.map(media => {
      const file = records.get(hash(JSON.stringify([media.url, media.updatedAt, media.filesize])))
      if (!file.promptIds.includes(prompt.id)) file.promptIds.push(prompt.id)
      return file.path
    })
  }
  const files = [...records.values()].sort((a, b) => a.path.localeCompare(b.path, 'en') || a.fingerprint.localeCompare(b.fingerprint, 'en'))
  const picks = prompts.filter(p => p.featured).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id, 'en')).slice(0, 4)
  for (const prompt of picks) {
    const source = output.get(prompt.images[0])
    const fingerprint = hash(`sharp-contain-840x525-webp88-v1:${hash(source)}`)
    const prior = old.get(fingerprint)
    const bytes = await cached(prior) || await sharp(source).rotate().resize(840, 525, { fit: 'contain', background: '#10150f' }).webp({ quality: 88 }).toBuffer()
    prompt.featuredImage = `assets/featured/${prompt.id}.webp`
    output.set(prompt.featuredImage, bytes)
    files.push({ path: prompt.featuredImage, fingerprint, sha256: hash(bytes), bytes: bytes.length, sourceUrl: prompt.source, promptIds: [prompt.id], width: 840, height: 525 })
  }
  output.set('assets/manifest.json', json({ schemaVersion: 2, note: 'Generated images from CMS. Source attribution remains in the catalogs. Featured previews preserve the complete frame.', files }))
  return output
}
