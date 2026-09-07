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
test('only public fields enter the renderer; prompt code fences remain intact', () => {
  const [prompt] = projectPrompts([doc()], 1, origin)
  assert(!JSON.stringify(prompt).includes('private-sentinel'))
  prompt.images = ['assets/previews/example.webp']
  const output = renderAll([prompt])
  assert.equal(output.size, 17)
  for (const [path, content] of output) {
    assert(!content.includes('private-sentinel'))
    if (path === 'docs/with-code.md') continue
    assert(content.includes('````text\nBuild a scene.\n```js\nconst x = 1\n```\n````'))
    assert(content.includes('An &lt;interesting&gt; scene'))
    assert(!content.includes('https://www.tripo3d.ai/3d-prompts/test-scene'), 'Do not invent detail pages for new CMS-only prompts')
  }
})
