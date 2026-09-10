import test from 'node:test'
import assert from 'node:assert/strict'
import { createCMS, projectPrompts } from './lib/cms.mjs'
import { locales } from './lib/locales.mjs'
import { renderAll } from './lib/render.mjs'
const origin = 'https://cms.example.com'
const localized = value => Object.fromEntries(locales.map(l => [l.cms, value]))
const doc = () => ({
  id: 1, status: 'published', model: 1, updatedAt: '2026-09-07T00:00:00Z', slug: 'test-scene',
  title: localized('An <interesting> scene'), prompt: localized('Build a scene.\n```js\nconst x = 1\n```'), description: localized(''),
  source: { postId: '1234567890123456789', url: 'https://example.com/post', publishedAt: '2026-09-06T00:00:00Z' },
  author: { name: 'Creator', url: 'https://example.com/creator' },
  media: [{ url: origin + '/api/media/file/image.webp', filesize: 100, mimeType: 'image/webp', sourceURL: 'https://example.com/image.webp' }],
  editorial: { featured: false, order: 0 }, sourceMeta: { apiKey: 'private-sentinel', confidential: 'never export' },
})
const envelope = (docs, page, totalDocs = 2, totalPages = 2) => Response.json({ docs, page, totalDocs, totalPages, hasNextPage: page < totalPages, nextPage: page < totalPages ? page + 1 : null })

test('fetches every page with exact auth, no redirects or locale fallback', async () => {
  const seen = []
  const cms = createCMS({ baseURL: origin, apiKey: 'test-only-key', fetcher: async (url, init) => {
    assert.equal(init.headers.Authorization, 'users API-Key test-only-key'); assert.equal(init.redirect, 'error')
    assert.equal(url.searchParams.get('fallback-locale'), 'none'); assert.equal(url.searchParams.get('locale'), 'all')
    const page = Number(url.searchParams.get('page')); seen.push(page)
    return envelope([{ id: page }], page)
  } })
  assert.equal((await cms.all('prompts')).length, 2)
  assert.deepEqual(seen, [1, 2])
})
test('rejects truncated, changing and duplicate pagination', async () => {
  for (const scenario of ['truncated', 'changing', 'duplicate']) {
    const cms = createCMS({ baseURL: origin, apiKey: 'test-only-key', fetcher: async url => {
      const page = Number(url.searchParams.get('page'))
      if (page === 1) return envelope([{ id: 1 }], page)
      return envelope(scenario === 'truncated' ? [] : [{ id: scenario === 'duplicate' ? 1 : 2 }], page, scenario === 'changing' ? 3 : 2)
    } })
    await assert.rejects(cms.all('prompts'))
  }
})
test('refuses foreign media before making a request and hides error bodies', async () => {
  let calls = 0
  const cms = createCMS({ baseURL: origin, apiKey: 'test-only-key', fetcher: async () => { calls++; return new Response('private-sentinel', { status: 403 }) } })
  await assert.rejects(cms.request('https://other.example/api/media/file/image.webp', { media: true }), /another origin/)
  assert.equal(calls, 0)
  await assert.rejects(cms.request('/api/prompts'), error => error.message.includes('403') && !error.message.includes('private-sentinel'))
})
test('missing one translation, draft, empty or unsafe source blocks publication', () => {
  for (const change of [d => delete d.prompt.vi, d => { d.status = 'draft' }, d => { d.source.url = 'javascript:alert(1)' }, d => { d.media[0].url = 'https://other.example/file' }]) {
    const value = doc(); change(value)
    assert.throws(() => projectPrompts([value], 1, origin))
  }
  assert.throws(() => projectPrompts([], 1, origin), /empty/)
})
test('every prompt links to its localized Tripo detail page; prompt code fences remain intact', () => {
  const value = doc()
  value.prompt = localized('Build a scene.  \n```js\nconst x = 1\n```')
  const [prompt] = projectPrompts([value], 1, origin)
  assert(!JSON.stringify(prompt).includes('private-sentinel'))
  prompt.images = ['assets/previews/example.webp']
  const output = renderAll([prompt])
  assert.equal(output.size, 17)
  for (const [path, content] of output) {
    assert(!content.includes('private-sentinel'))
    if (path === 'docs/with-code.md') continue
    assert(content.includes('````text\nBuild a scene.\n```js\nconst x = 1\n```\n````'))
    assert(content.includes('An &lt;interesting&gt; scene'))
    const locale = locales.find(l => path === `docs/catalog.${l.code}.md` || path === (l.code === 'en' ? 'README.md' : l.code === 'zh' ? 'README.zh-CN.md' : ''))
    const detailURL = `https://www.tripo3d.ai${locale.code === 'en' ? '' : `/${locale.code}`}/3d-prompts/test-scene`
    assert(content.includes(`[${locale.detail} ↗](${detailURL})`))
  }
})

test('public R2 media is accepted and fetched anonymously; legacy files retain auth', async () => {
  const seen = []
  const cms = createCMS({ baseURL: origin, apiKey: 'test-only-key', fetcher: async (url, init) => {
    seen.push({ url: url.href, headers: init.headers, redirect: init.redirect })
    return new Response('media')
  } })
  const value = doc()
  value.media[0].url = 'https://media.tripogrowth.space/media/image.webp'
  value.video = { url: 'https://media.tripogrowth.space/media/current.mp4', sourceURL: 'https://example.com/old.mp4' }
  const [projected] = projectPrompts([value], 1, origin)
  await cms.request(projected.media[0].url, { media: true })
  await cms.request('/api/media/file/image.webp', { media: true })
  assert.deepEqual(seen.map(r => r.headers), [{}, { Authorization: 'users API-Key test-only-key' }])
  assert(seen.every(r => r.redirect === 'error'))
})

test('R2 allowance does not authorize arbitrary hosts, signed URLs, paths or API calls', async () => {
  let calls = 0
  const cms = createCMS({ baseURL: origin, apiKey: 'test-only-key', fetcher: async () => { calls++; return new Response('unexpected') } })
  for (const url of [
    'https://media.tripogrowth.space.evil.example/media/image.webp',
    'https://media.tripogrowth.space/api/prompts',
    'https://media.tripogrowth.space/media/image.webp?token=secret',
    'https://user:secret@media.tripogrowth.space/media/image.webp',
    'https://media.tripogrowth.space/media/folder%2Fimage.webp',
    'http://media.tripogrowth.space/media/image.webp',
  ]) await assert.rejects(cms.request(url, { media: true }))
  await assert.rejects(cms.request('https://media.tripogrowth.space/api/prompts'))
  assert.equal(calls, 0)
})

test('public media retries stay anonymous and redirect responses are rejected', async () => {
  let attempts = 0
  const cms = createCMS({ baseURL: origin, apiKey: 'test-only-key', retryDelay: 0, fetcher: async (url, init) => {
    assert.deepEqual(init.headers, {})
    assert.equal(init.redirect, 'error')
    return ++attempts === 1 ? new Response('', { status: 503 }) : new Response('', { status: 302, headers: { location: 'https://other.example/file' } })
  } })
  await assert.rejects(cms.request('https://media.tripogrowth.space/media/image.webp', { media: true }), /HTTP 302/)
  assert.equal(attempts, 2)
})

test('video-only featured prompts retain all translations and use detail links without broken thumbnails', async () => {
  const { prepareMedia } = await import('./lib/media.mjs')
  const value = doc()
  value.media = []
  value.video = { url: 'https://media.tripogrowth.space/media/current.mp4' }
  value.editorial.featured = true
  const prompts = projectPrompts([value], 1, origin)
  const media = await prepareMedia(prompts, { request: async () => { throw new Error('No image should be requested') } })
  assert.equal(JSON.parse(media.get('assets/manifest.json')).files.length, 0)
  for (const [path, contents] of renderAll(prompts)) {
    if (path === 'docs/with-code.md') continue
    assert(!contents.includes(value.video.url))
    assert(contents.includes(`/3d-prompts/${value.slug}`))
    assert(contents.includes('Build a scene.'))
    assert(!contents.includes('assets/featured/') && !contents.includes('undefined'))
  }
})

test('uses the slug when a source identifier is not a safe Markdown anchor', () => {
  const value = doc()
  value.source.postId = 'owner/repository#example'
  value.source.publishedAt = null
  value.publishedAt = '2026-09-08T00:00:00Z'
  const [prompt] = projectPrompts([value], 1, origin)
  assert.equal(prompt.id, value.slug)
  assert.equal(prompt.date, '2026-09-08')
})
