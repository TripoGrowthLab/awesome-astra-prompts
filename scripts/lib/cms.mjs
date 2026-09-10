import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { locales, modelSlug } from './locales.mjs'

const publicMediaOrigin = 'https://media.tripogrowth.space'

// CMS metadata is private; its current R2 media URLs are public. Keep the
// legacy authenticated file endpoint working without forwarding keys to R2.
export function mediaURL(value, cmsOrigin) {
  const url = new URL(value, cmsOrigin)
  const isPublic = url.origin === publicMediaOrigin
  assert(isPublic || url.origin === cmsOrigin, 'Never send the CMS key to another origin; unsupported media host')
  assert(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, 'Unexpected CMS media URL')
  const prefix = isPublic ? '/media/' : '/api/media/file/'
  assert(url.pathname.startsWith(prefix), 'Unexpected CMS media path')
  const filename = decodeURIComponent(url.pathname.slice(prefix.length))
  assert(filename && !/[\/\\\x00-\x1f]/.test(filename) && !['.', '..'].includes(filename), 'Invalid CMS media filename')
  return { url, authenticated: !isPublic }
}

export function publicURL(value, cmsOrigin) {
  if (!value) return null
  const url = new URL(value)
  assert(url.protocol === 'https:' && !url.username && !url.password && url.origin !== cmsOrigin, 'Expected a public HTTPS link')
  assert(!/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(url.hostname), 'Private link is not publishable')
  assert(!/[\s<>"\\]/.test(value) && !/[?&](?:token|key|signature|x-amz-[^=]*)=/i.test(value), 'Unsafe or signed link is not publishable')
  return url.href
}

export function createCMS({ baseURL, apiKey, fetcher = fetch, retryDelay = 1000 }) {
  assert(apiKey, 'Set CMS_API_KEY to a read-only CMS User API Key')
  const base = new URL(baseURL)
  assert(base.protocol === 'https:' && !base.username && !base.password && base.pathname === '/', 'CMS_URL must be an HTTPS origin')
  async function request(path, { media = false } = {}) {
    const url = new URL(path, base)
    let authenticated = true
    if (media) ({ authenticated } = mediaURL(url.href, base.origin))
    else {
      assert.equal(url.origin, base.origin, 'Never send the CMS key to another origin')
      assert(!url.username && !url.password && url.pathname.startsWith('/api/'), 'Unexpected CMS endpoint')
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      let response
      try {
        response = await fetcher(url, { headers: authenticated ? { Authorization: `users API-Key ${apiKey}` } : {}, redirect: 'error', signal: AbortSignal.timeout(60_000) })
      } catch {
        if (attempt === 2) throw new Error(`CMS request failed: ${url.pathname}`)
        await delay(retryDelay * (attempt + 1)); continue
      }
      if (response.status === 429 || response.status >= 500) {
        await response.body?.cancel()
        if (attempt < 2) { await delay(retryDelay * (attempt + 1)); continue }
      }
      // Do not log response bodies: authentication failures can contain private diagnostics.
      assert(response.ok, `CMS HTTP ${response.status}: ${url.pathname}`)
      return response
    }
  }
  async function all(collection, params = {}) {
    const docs = [], ids = new Set()
    let total, pages
    for (let page = 1; ; page++) {
      assert(page <= 1000, 'CMS pagination exceeded the safety limit')
      const query = new URLSearchParams({ limit: '50', depth: '1', locale: 'all', 'fallback-locale': 'none', sort: 'id', ...params, page: String(page) })
      const response = await request(`/api/${collection}?${query}`)
      const data = await response.json()
      assert(Array.isArray(data.docs) && Number.isInteger(data.totalDocs) && Number.isInteger(data.totalPages), 'Invalid CMS pagination envelope')
      total ??= data.totalDocs; pages ??= data.totalPages
      assert.equal(data.totalDocs, total, 'CMS count changed during pagination; rerun sync')
      assert.equal(data.totalPages, pages, 'CMS page count changed; rerun sync')
      assert.equal(data.page, page, 'Unexpected CMS page')
      for (const doc of data.docs) {
        assert(doc.id && !ids.has(doc.id), 'Duplicate CMS document across pages')
        ids.add(doc.id); docs.push(doc)
      }
      if (page >= pages) { assert(!data.hasNextPage, 'Inconsistent final CMS page'); break }
      assert(data.docs.length && data.hasNextPage && data.nextPage === page + 1, 'Truncated CMS pagination')
    }
    assert.equal(docs.length, total, 'Incomplete CMS collection')
    return docs
  }
  return { origin: base.origin, all, request }
}

export const promptQuery = modelId => ({ 'where[model][equals]': String(modelId), 'where[status][equals]': 'published' })
export const revision = docs => docs.map(d => `${d.id}:${d.updatedAt}`).sort().join('|')

// Allowlist public fields rather than exporting raw CMS records or sourceMeta.
export function projectPrompts(docs, modelId, cmsOrigin) {
  assert(docs.length > 0, 'Refusing to replace the collection with an empty CMS result')
  const ids = new Set(), slugs = new Set()
  return docs.map(doc => {
    assert(doc.status === 'published' && (doc.model?.id ?? doc.model) === modelId, 'Unexpected unpublished or unrelated prompt')
    assert(doc.updatedAt && !Number.isNaN(Date.parse(doc.updatedAt)), 'Missing CMS revision')
    const sourceId = String(doc.source?.postId || '')
    // A source identifier may be a repository fragment rather than a public-safe
    // anchor. The CMS slug is always validated and remains stable in that case.
    const id = /^[a-z0-9][a-z0-9-]*$/.test(sourceId) ? sourceId : doc.slug
    assert(/^[a-z0-9][a-z0-9-]*$/.test(id) && !ids.has(id), 'Invalid or duplicate public prompt ID')
    ids.add(id)
    assert(/^[a-z0-9][a-z0-9-]*$/.test(doc.slug) && !slugs.has(doc.slug), 'Invalid or duplicate prompt slug')
    slugs.add(doc.slug)
    const translations = Object.fromEntries(locales.map(locale => {
      const entry = {}
      for (const field of ['title', 'prompt']) {
        const value = doc[field]?.[locale.cms]
        assert(typeof value === 'string' && value.trim(), `Missing ${locale.cms} ${field} for ${id}; complete translations in CMS before syncing`)
        entry[field] = value
      }
      entry.description = typeof doc.description?.[locale.cms] === 'string' ? doc.description[locale.cms] : ''
      return [locale.code, entry]
    }))
    const source = publicURL(doc.source?.url, cmsOrigin)
    assert(source && doc.author?.name?.trim(), `Missing source attribution for ${id}`)
    const date = doc.source?.publishedAt || doc.publishedAt
    assert(date && !Number.isNaN(Date.parse(date)), `Missing source date for ${id}`)
    // Images are optional in CMS: video-only and text prompts are publishable.
    assert(Array.isArray(doc.media), `Invalid image list for ${id}`)
    const media = doc.media.map(m => {
      assert(m && typeof m === 'object' && /^image\/(webp|png|jpeg|gif)$/.test(m.mimeType), `Invalid preview image for ${id}`)
      assert(Number.isInteger(m.filesize) && m.filesize > 0 && m.filesize <= 25 * 1024 * 1024, `Invalid preview size for ${id}`)
      const { url } = mediaURL(m.url, cmsOrigin)
      return { url: url.href, mimeType: m.mimeType, filesize: m.filesize, updatedAt: m.updatedAt, source: publicURL(m.sourceURL, cmsOrigin) || source }
    })
    return {
      id, slug: doc.slug, translations, author: { name: doc.author.name, url: publicURL(doc.author.url, cmsOrigin) || source },
      source, date: date.slice(0, 10), publishedAt: new Date(date).toISOString(), repository: publicURL(doc.links?.repository, cmsOrigin), demo: publicURL(doc.links?.liveDemo, cmsOrigin),
      media, featured: Boolean(doc.editorial?.featured), order: Number.isFinite(doc.editorial?.order) ? doc.editorial.order : 0,
    }
  }).sort((a, b) => Number(Boolean(b.repository)) - Number(Boolean(a.repository)) || a.order - b.order || a.id.localeCompare(b.id, 'en'))
}

export async function fetchCollection(cms) {
  const models = await cms.all('ai-models', { 'where[slug][equals]': modelSlug, depth: '0' })
  assert.equal(models.length, 1, 'Expected exactly one Astra model')
  assert(models[0].active, 'Astra model is inactive')
  const modelId = models[0].id
  const selection = Object.fromEntries(['id', 'title', 'slug', 'status', 'model', 'description', 'prompt', 'source', 'author', 'media', 'links', 'editorial', 'publishedAt', 'updatedAt'].map(field => [`select[${field}]`, 'true']))
  const docs = await cms.all('prompts', { ...promptQuery(modelId), ...selection })
  return { prompts: projectPrompts(docs, modelId, cms.origin), revision: revision(docs), modelId }
}
