import test from 'node:test'
import assert from 'node:assert/strict'
import { selectCatalog } from './lib/catalog.mjs'
import { renderAll, renderCatalog } from './lib/render.mjs'
import { locales } from './lib/locales.mjs'

const fixtures = count => Array.from({ length: count }, (_, i) => ({
  id: String(i + 1), date: '2026-09-09', publishedAt: new Date(Date.UTC(2026, 8, 9, 0, i)).toISOString(),
  source: `https://example.com/post/${i + 1}`, author: { name: 'Creator', url: 'https://example.com/creator' },
  translations: Object.fromEntries(locales.map(l => [l.code, { title: `Example ${i + 1}`, prompt: `Build ${i + 1}`, description: '' }])),
  repository: `https://github.com/example/project-${i + 1}`, images: ['assets/previews/example.webp'],
  featured: true, featuredImage: 'assets/featured/example.webp', order: i,
}))

test('caps at 100 newest publications, preserving presentation order and input', () => {
  for (const count of [99, 100, 101, 184]) {
    const prompts = fixtures(count), before = structuredClone(prompts)
    const selected = selectCatalog(prompts)
    assert.equal(selected.length, Math.min(100, count))
    assert.deepEqual(selected.map(p => p.id), prompts.slice(Math.max(0, count - 100)).map(p => p.id))
    assert.deepEqual(prompts, before)
  }
  const tied = fixtures(101).map(p => ({ ...p, publishedAt: '2026-09-09T00:00:00.000Z' }))
  assert.deepEqual(selectCatalog(tied).map(p => p.id), selectCatalog([...tied].reverse()).reverse().map(p => p.id))
  assert(!selectCatalog(tied).some(p => p.id === '1'))
})

test('every language, featured card and code index references only selected examples', () => {
  const prompts = fixtures(101)
  const output = renderAll(prompts)
  assert.equal(output.size, 17)
  for (const [path, content] of output) {
    assert(!content.includes('project-1)') && !content.includes('project-1"'), `Omitted repository in ${path}`)
    assert(!content.includes('#1"') && !content.includes('#1)'), `Omitted anchor in ${path}`)
    if (path === 'docs/with-code.md') continue
    assert.equal([...content.matchAll(/^```text$/gm)].length, 100)
    assert.equal([...content.matchAll(/<a id="\d+"><\/a>/g)].length, 100)
    const locale = locales.find(l => path === `docs/catalog.${l.code}.md` || path === (l.code === 'en' ? 'README.md' : l.code === 'zh' ? 'README.zh-CN.md' : ''))
    const gallery = `https://www.tripo3d.ai${locale.code === 'en' ? '' : `/${locale.code}`}/3d-prompts/models/gpt-6-astra?`
    assert(content.includes('101'), `Missing full count in ${path}`)
    assert(!content.includes('utm_content=catalog_top'))
    assert(content.includes('utm_content=catalog_bottom'))
    assert.equal(content.split(gallery).length - 1, 2)
    assert(content.indexOf('utm_content=catalog_bottom') > content.lastIndexOf('```text'))
  }
  assert.equal([...renderCatalog(prompts, locales[0]).matchAll(/^```text$/gm)].length, 100)
  assert(output.get('README.md').includes('**101 examples · 14 languages · 101 examples with source code**'))
  assert(output.get('README.zh-CN.md').includes('**101 条案例 · 14 种语言 · 101 条附项目源码**'))
})

test('does not claim additional examples when the whole collection fits', () => {
  for (const count of [99, 100]) {
    const content = renderCatalog(fixtures(count), locales[0])
    assert(!content.includes('utm_content=catalog_'))
    assert.equal([...content.matchAll(/^```text$/gm)].length, count)
  }
})
