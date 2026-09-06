// Generate display-only letterboxed thumbnails; source previews stay untouched.
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const dataset = JSON.parse(await readFile('data/prompts.json', 'utf8'))
if (!Array.isArray(dataset.featuredIds) || !dataset.featuredIds.length) throw new Error('Export the shared featuredIds before generating thumbnails.')
const width = 840
const height = 525
const background = '0x10150f'
const files = []
await mkdir('assets/featured', { recursive: true })
for (const id of dataset.featuredIds) {
  const prompt = dataset.prompts.find(entry => entry.id === id)
  if (!prompt || !/^assets\/previews\/[a-z0-9.-]+\.webp$/.test(prompt.media.image)) throw new Error(`Vendor the source preview first: ${id}`)
  const sourceSha256 = hash(await readFile(prompt.media.image))
  const path = `assets/featured/${id}.webp`
  // Some ffmpeg distributions omit libwebp; use the standalone WebP encoder.
  const temp = await mkdtemp(join(tmpdir(), 'astra-featured-'))
  try {
    const frame = join(temp, 'frame.png')
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', prompt.media.image, '-frames:v', '1', '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${background},setsar=1`, frame])
    await run('cwebp', ['-quiet', '-q', '88', '-m', '6', frame, '-o', path])
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
  const bytes = await readFile(path)
  files.push({ id, path, sourcePath: prompt.media.image, sourceSha256, sha256: hash(bytes), bytes: bytes.length, width, height })
}
await writeFile('assets/featured/manifest.json', `${JSON.stringify({ schemaVersion: 1, note: 'Display-only 16:10 letterbox previews. Full source frames are preserved without cropping or distortion.', files }, null, 2)}\n`)
console.log(`Built ${files.length} consistently sized featured previews.`)
