import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join, resolve, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { locales } from './lib/locales.mjs'
import { CATALOG_LIMIT, galleryNotice } from './lib/catalog.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const withoutFences = content => {
  let fence = 0
  return content.split('\n').filter(line => {
    const match = line.match(/^(`{3,})/)
    if (match && (!fence || match[1].length >= fence)) { fence = fence ? 0 : match[1].length; return false }
    return !fence
  }).join('\n')
}
export async function validateOutputs(staging = '.') {
  const root = process.cwd()
  const read = async path => {
    try { return await readFile(join(staging, path)) } catch (error) {
      if (staging === '.' || error.code !== 'ENOENT') throw error
      return readFile(path)
    }
  }
  const manifest = JSON.parse(await read('docs/sync-manifest.json'))
  const media = JSON.parse(await read('assets/manifest.json'))
  assert.equal(manifest.schemaVersion, 1)
  assert(manifest.count > 0)
  assert.equal(manifest.limit, CATALOG_LIMIT)
  assert(Number.isSafeInteger(manifest.totalCount) && manifest.totalCount >= manifest.count)
  assert.equal(manifest.count, Math.min(manifest.totalCount, CATALOG_LIMIT), 'Catalog must contain at most the latest 100 prompts')
  assert.equal(manifest.promptIds.length, manifest.count)
  assert.equal(new Set(manifest.promptIds).size, manifest.count)
  assert.deepEqual(manifest.locales, locales.map(l => l.code))
  assert.equal(media.schemaVersion, 2)
  const expected = ['README.md', 'README.zh-CN.md', 'docs/with-code.md', 'assets/manifest.json', ...locales.map(l => `docs/catalog.${l.code}.md`)].sort()
  assert.deepEqual(manifest.files.map(f => f.path).sort(), expected)
  for (const file of [...manifest.files, ...media.files]) {
    assert(/^(README(?:\.zh-CN)?\.md|docs\/[a-zA-Z0-9.-]+|assets\/(manifest\.json|(?:previews|featured)\/[a-z0-9.-]+))$/.test(file.path), 'Unexpected generated file path')
    const bytes = await read(file.path)
    assert.equal(hash(bytes), file.sha256, `Generated checksum mismatch: ${file.path}`)
    assert.equal(bytes.length, file.bytes, `Generated file size mismatch: ${file.path}`)
  }
  const imagePromptIds = manifest.imagePromptIds ?? manifest.promptIds
  assert.equal(new Set(imagePromptIds).size, imagePromptIds.length, 'Duplicate image prompt IDs')
  assert(imagePromptIds.every(id => manifest.promptIds.includes(id)), 'Unknown image prompt ID')
  assert.deepEqual([...new Set(media.files.filter(f => f.path.startsWith('assets/previews/')).flatMap(f => f.promptIds))].sort(), [...imagePromptIds].sort())
  let linkCount = 0
  for (const path of expected.filter(p => p.endsWith('.md'))) {
    const content = (await read(path)).toString()
    assert(!/\/(?:Users|home)\/[\w.-]+\/|(?:sk-|ghp_)[A-Za-z0-9]{24,}|users API-Key|cms\.tripogrowth\.space\/api\//.test(content), `Private content in ${path}`)
    if (process.env.CMS_API_KEY) assert(!content.includes(process.env.CMS_API_KEY), `Credential in ${path}`)
    const prose = withoutFences(content)
    assert(!/source-derived|hidden prompt|来源整理稿|Get the JSON|Try an idea, then make it yours|What “prompt” means here/i.test(prose), `Removed copy returned in ${path}`)
    if (path !== 'docs/with-code.md') {
      const locale = locales.find(l => path === `docs/catalog.${l.code}.md` || path === (l.code === 'en' ? 'README.md' : l.code === 'zh' ? 'README.zh-CN.md' : ''))
      const detailPrefix = `[${locale.detail} ↗](https://www.tripo3d.ai${locale.code === 'en' ? '' : `/${locale.code}`}/3d-prompts/`
      assert.equal(content.split(detailPrefix).length - 1, manifest.count, `Every example must have one localized detail link: ${path}`)
      assert(!/\.mp4(?:[?#][^)]*)?\)/i.test(prose), `Video CTA returned: ${path}`)
      assert(!prose.includes('utm_content=catalog_top'), `Top gallery box returned: ${path}`)
      assert(prose.includes(galleryNotice(locale, manifest.count, manifest.totalCount, 'bottom')), `Missing localized gallery link: ${path}`)
      if (locale.code === 'en') assert(prose.includes(`**${manifest.totalCount} examples · ${locales.length} languages · ${manifest.sourceCodeCount} examples with source code**`), `Incorrect full collection counts: ${path}`)
      if (locale.code === 'zh') assert(prose.includes(`**${manifest.totalCount} 条案例 · ${locales.length} 种语言 · ${manifest.sourceCodeCount} 条附项目源码**`), `Incorrect full collection counts: ${path}`)
      const ids = [...prose.matchAll(/<a id="([^"]+)"><\/a>/g)].map(m => m[1])
      assert.deepEqual(ids, ['all-prompts', ...manifest.promptIds], `Missing or reordered examples: ${path}`)
      const badges = [...prose.matchAll(/alt="([^"]+)" src="https:\/\/img.shields.io\/badge\//g)]
      assert.equal(badges.length, locales.length, `Missing language badges: ${path}`)
      assert(prose.indexOf('img.shields.io/badge/English') < prose.indexOf('assets/hero.webp'), 'Language navigation must precede the hero')
      assert.equal([...content.matchAll(/^`{3,}text$/gm)].length, manifest.count, `Incomplete prompt blocks: ${path}`)
    }
    const targets = [...prose.matchAll(/(?:href|src)="([^"]+)"|\]\(([^)\s]+)\)/g)].map(m => m[1] || m[2])
    for (const target of targets) {
      if (/^(?:https?:|mailto:)/.test(target)) continue
      const [file, anchor] = target.split('#')
      const destination = file ? relative(root, resolve(dirname(path), file)) : path
      assert(!destination.startsWith('..'), `Link escapes repository: ${path}`)
      let targetContent
      try { targetContent = await read(destination) } catch { throw new Error(`Broken local link: ${path} -> ${target}`) }
      if (anchor) assert(targetContent.toString().includes(`id="${anchor}"`), `Missing anchor: ${path} -> ${target}`)
      linkCount++
    }
  }
  if (staging === '.') {
    for (const dir of ['assets/previews', 'assets/featured']) {
      const actual = (await readdir(dir)).map(name => `${dir}/${name}`).sort()
      assert.deepEqual(actual, [...new Set(media.files.filter(f => f.path.startsWith(dir + '/')).map(f => f.path))].sort(), `Orphan media in ${dir}`)
    }
    await assert.rejects(stat('data'), { code: 'ENOENT' }, 'Original data directory must be removed')
    for (const path of ['CONTRIBUTING.md', 'RIGHTS.md']) assert(!(await readFile(path, 'utf8')).includes('data/'), `Stale data reference in ${path}`)
  }
  console.log(`Validated ${manifest.count} prompts × ${locales.length} languages, checksums, attribution and ${linkCount} local links`)
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  validateOutputs().catch(error => { console.error(error.message); process.exitCode = 1 })
}
