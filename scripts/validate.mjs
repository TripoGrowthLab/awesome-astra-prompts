import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, resolve, relative } from 'node:path'

const read = async path => JSON.parse(await readFile(path, 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const root = process.cwd()
const data = await read('data/prompts.json')
const schema = await read('schema/prompt.schema.json')
const manifest = await read('data/manifest.json')

// A dependency-free checker for the schema keywords used by this collection.
// Unsupported keywords fail explicitly instead of being silently ignored.
function validate(value, rule, path = '$') {
  const supported = ['$schema', 'title', 'description', '$defs', '$ref', 'const', 'enum', 'type', 'required', 'additionalProperties', 'properties', 'minItems', 'uniqueItems', 'items', 'minimum', 'minLength', 'pattern', 'format']
  for (const key of Object.keys(rule)) assert(supported.includes(key), `Unsupported schema keyword ${key}`)
  if (rule.$ref) return validate(value, rule.$ref.split('/').slice(1).reduce((node, part) => node[part], schema), path)
  if ('const' in rule) assert.deepEqual(value, rule.const, `${path}: const`)
  if (rule.enum) assert(rule.enum.includes(value), `${path}: enum`)
  if (rule.type === 'object') {
    assert(value && typeof value === 'object' && !Array.isArray(value), `${path}: object`)
    for (const field of rule.required || []) assert(Object.hasOwn(value, field), `${path}: missing ${field}`)
    for (const [key, entry] of Object.entries(value)) {
      if (rule.additionalProperties === false) assert(Object.hasOwn(rule.properties, key), `${path}: extra field ${key}`)
      if (rule.properties?.[key]) validate(entry, rule.properties[key], `${path}.${key}`)
    }
  }
  if (rule.type === 'array') {
    assert(Array.isArray(value), `${path}: array`)
    if (rule.minItems) assert(value.length >= rule.minItems, `${path}: minItems`)
    if (rule.uniqueItems) assert.equal(new Set(value.map(entry => JSON.stringify(entry))).size, value.length, `${path}: uniqueItems`)
    value.forEach((entry, i) => validate(entry, rule.items, `${path}[${i}]`))
  }
  if (rule.type === 'integer') {
    assert(Number.isInteger(value), `${path}: integer`)
    if ('minimum' in rule) assert(value >= rule.minimum, `${path}: minimum`)
  }
  if (rule.type === 'string') {
    assert.equal(typeof value, 'string', `${path}: string`)
    if (rule.minLength) assert(value.trim().length >= rule.minLength, `${path}: minLength`)
    if (rule.pattern) assert(new RegExp(rule.pattern).test(value), `${path}: pattern`)
    if (rule.format === 'date-time') assert(!Number.isNaN(Date.parse(value)), `${path}: date`)
    if (rule.format === 'uri') {
      const url = new URL(value)
      assert(url.protocol === 'https:' && !url.username && !url.password, `${path}: public HTTPS URL`)
      assert(!['localhost', '127.0.0.1'].includes(url.hostname), `${path}: private URL`)
    }
  }
}
validate(data, schema)
assert.equal(data.count, data.prompts.length)
assert.equal(manifest.count, data.count)
const ids = data.prompts.map(prompt => prompt.id)
assert.equal(new Set(ids).size, ids.length, 'Duplicate IDs')
assert.equal(new Set(data.prompts.map(prompt => new URL(prompt.source.url).pathname.split('/status/')[1])).size, ids.length, 'Duplicate source posts')
for (const prompt of data.prompts) {
  assert(prompt.source.url.endsWith(`/status/${prompt.id}`), 'ID must be the exact tweet ID string')
  assert(prompt.slug.endsWith(`-${prompt.id}`), 'Canonical slug must end with the tweet ID')
  assert.equal(prompt.links.tripo, `https://www.tripo3d.ai/3d-prompts/${prompt.slug}`)
  assert(prompt.media.image.startsWith('assets/previews/'), `Preview must be repository-local: ${prompt.id}`)
  if (prompt.links.repository) assert.equal(new URL(prompt.links.repository).hostname, 'github.com')
}
for (const locale of data.locales) {
  const catalog = await read(`data/locales/${locale}.json`)
  assert.equal(catalog.locale, locale)
  assert.equal(catalog.count, data.count)
  assert.deepEqual(Object.keys(catalog.prompts).sort(), [...ids].sort())
  for (const prompt of data.prompts) {
    const entry = catalog.prompts[prompt.id]
    validate(entry, schema.$defs.localizedPrompt, `${locale}.${prompt.id}`)
    assert.equal(entry.tags.length, prompt.tags.length)
    assert.equal(entry.pageUrl, `https://www.tripo3d.ai${locale === 'en' ? '' : `/${locale}`}/3d-prompts/${prompt.slug}`)
    if (locale === 'en') for (const key of ['title', 'description', 'prompt']) assert.equal(entry[key], prompt[key])
    else assert.notEqual(entry.prompt, prompt.prompt, `${locale}.${prompt.id}: untranslated body`)
  }
}
assert.deepEqual(manifest.locales, data.locales)
for (const kind of ['verbatim', 'source-derived']) assert.equal(manifest.evidenceCounts[kind], data.prompts.filter(prompt => prompt.evidence.kind === kind).length)
const repositories = await read('data/repositories.json')
assert.equal(repositories.count, repositories.repositories.length)
assert.equal(manifest.repositoryCount, repositories.count)
assert.equal(repositories.promptCount, data.prompts.filter(prompt => prompt.links.repository).length)
for (const repo of repositories.repositories) for (const id of repo.promptIds) assert.equal(data.prompts.find(prompt => prompt.id === id)?.links.repository, repo.url)
for (const entry of manifest.files) {
  const bytes = await readFile(entry.path)
  assert.equal(hash(bytes), entry.sha256, `Data checksum: ${entry.path}`)
  assert.equal(bytes.length, entry.bytes)
}
const assets = await read('assets/manifest.json')
const imageIds = []
for (const file of assets.files) {
  const bytes = await readFile(file.path)
  assert.equal(hash(bytes), file.sha256, `Image checksum: ${file.path}`)
  assert.equal(bytes.length, file.bytes)
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP')
  for (const id of file.promptIds) {
    imageIds.push(id)
    assert.equal(data.prompts.find(prompt => prompt.id === id)?.media.image, file.path)
  }
}
assert.deepEqual(imageIds.sort(), [...ids].sort(), 'Image provenance must cover every prompt exactly once')
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.filter(entry => !['.git', 'node_modules'].includes(entry.name)).map(async entry => entry.isDirectory() ? files(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]))).flat()
}
const allFiles = await files('.')
assert.equal(allFiles.filter(path => path.startsWith('./assets/previews/')).length, assets.files.length, 'Unreferenced preview files')
let linkCount = 0
for (const path of allFiles.filter(path => /\.(md|json|mjs|yml)$/.test(path))) {
  const content = await readFile(path, 'utf8')
  // Do not publish local checkout paths, private source repo names or credential values.
  assert(!/\/(?:Users|home)\/[a-z][\w.-]*\/|\/var\/folders\/[a-z\d]+\/|(?:sk-|ghp_)[A-Za-z0-9]{24,}/i.test(content), `Private content: ${path}`)
  if (path.endsWith('.json') && path.startsWith('./data/')) assert(!/"(?:cmsId|folderId|metrics|likes|views|apiKey|accessToken)"\s*:/.test(content), `Internal field: ${path}`)
  if (!path.endsWith('.md')) continue
  const targets = [...content.matchAll(/(?:href|src)="([^"]+)"|\]\(([^)\s]+)\)/g)].map(match => match[1] || match[2])
  for (const target of targets) {
    if (/^(?:https?:|mailto:|#)/.test(target)) continue
    const [file, anchor] = target.split('#')
    const absolute = resolve(dirname(path), file)
    assert(!relative(root, absolute).startsWith('..'), `Link escapes repository: ${path} ${target}`)
    await stat(absolute)
    if (anchor && /^[1-9][0-9]{9,24}$/.test(anchor)) assert((await readFile(absolute, 'utf8')).includes(`id="${anchor}"`), `Missing anchor ${path} ${target}`)
    linkCount++
  }
}
console.log(`Validated ${data.count} records, ${data.locales.length} complete locales, ${assets.files.length} preview files, schema, checksums, privacy boundaries and ${linkCount} local links.`)
