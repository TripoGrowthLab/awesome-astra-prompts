import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { prepareMedia } from './lib/media.mjs'

const bytes = await sharp({ create: { width: 32, height: 20, channels: 3, background: '#c0ffee' } }).webp().toBuffer()
const prompt = () => ({ id: 'test-example', featured: true, order: 0, source: 'https://example.com/post', media: [{ url: 'https://cms.example.com/api/media/file/photo.webp', filesize: bytes.length, mimeType: 'image/webp', source: 'https://example.com/photo.webp', updatedAt: '2026-09-07' }] })

test('CMS image bytes are preserved and featured preview has the intended aspect ratio', async () => {
  const p = prompt()
  const output = await prepareMedia([p], { request: async () => new Response(bytes, { headers: { 'content-type': 'image/webp' } }) })
  assert.deepEqual(output.get(p.images[0]), bytes)
  const featured = await sharp(output.get(p.featuredImage)).metadata()
  assert.equal(featured.width, 840); assert.equal(featured.height, 525)
  assert(!output.get('assets/manifest.json').includes('cms.example.com'))
})

test('broken media stops preparation instead of producing a partial catalog', async () => {
  for (const body of [bytes.subarray(0, bytes.length - 1), Buffer.alloc(bytes.length), Buffer.concat([bytes, bytes])]) {
    await assert.rejects(prepareMedia([prompt()], { request: async () => new Response(body, { headers: { 'content-type': 'image/webp' } }) }))
  }
})
