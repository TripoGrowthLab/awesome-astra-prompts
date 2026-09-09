import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createCMS, fetchCollection, promptQuery, revision } from './lib/cms.mjs'
import { hash, json, prepareMedia, readManifest } from './lib/media.mjs'
import { renderAll } from './lib/render.mjs'
import { locales } from './lib/locales.mjs'
import { CATALOG_LIMIT, selectCatalog } from './lib/catalog.mjs'
import { validateOutputs } from './validate.mjs'

async function main() {
  const cms = createCMS({ baseURL: process.env.CMS_URL || 'https://cms.tripogrowth.space', apiKey: process.env.CMS_API_KEY })
  const { prompts: allPrompts, revision: initialRevision, modelId } = await fetchCollection(cms)
  console.log(`Verified ${allPrompts.length} published Astra prompts × ${locales.length} complete languages`)
  if (process.argv.includes('--verify-only')) return
  const prompts = selectCatalog(allPrompts)
  const output = await prepareMedia(prompts, cms, await readManifest())
  for (const [path, contents] of renderAll(allPrompts)) output.set(path, contents)
  // Avoid a mixed snapshot if editors publish/unpublish or edit a prompt while syncing.
  const latest = await cms.all('prompts', { ...promptQuery(modelId), depth: '0', 'select[id]': 'true', 'select[updatedAt]': 'true' })
  assert.equal(revision(latest), initialRevision, 'CMS changed during sync; no files were published. Rerun sync.')
  const files = [...output].filter(([path]) => path.endsWith('.md') || path.endsWith('manifest.json')).map(([path, content]) => ({ path, sha256: hash(content), bytes: Buffer.byteLength(content) })).sort((a, b) => a.path.localeCompare(b.path, 'en'))
  output.set('docs/sync-manifest.json', json({ schemaVersion: 1, model: 'gpt-6-astra', count: prompts.length, totalCount: allPrompts.length, sourceCodeCount: allPrompts.filter(p => p.repository).length, limit: CATALOG_LIMIT, locales: locales.map(l => l.code), promptIds: prompts.map(p => p.id), imagePromptIds: prompts.filter(p => p.images.length).map(p => p.id), files }))
  await mkdir('.cache', { recursive: true })
  const staging = await mkdtemp('.cache/sync-')
  try {
    for (const [path, content] of output) {
      const staged = join(staging, path)
      await mkdir(dirname(staged), { recursive: true })
      await writeFile(staged, content)
    }
    await validateOutputs(staging)
    if (process.argv.includes('--check')) {
      for (const [path, content] of output) assert.equal(hash(await readFile(path)), hash(content), `CMS output changed: ${path}; run npm run sync`)
      console.log('Committed output matches the live CMS')
      return
    }
    // Fetch, render and validate everything before touching the checked-in outputs.
    // Roll back a failed local write. GitHub publishes the resulting files in one commit.
    const writes = new Map(), obsolete = []
    for (const directory of ['assets/previews', 'assets/featured']) {
      for (const file of await readdir(directory).catch(error => { if (error.code === 'ENOENT') return []; throw error })) {
        const path = `${directory}/${file}`
        if (!output.has(path)) obsolete.push(path)
      }
    }
    for (const path of [...output.keys(), ...obsolete]) {
      try { writes.set(path, await readFile(path)) } catch (error) { if (error.code !== 'ENOENT') throw error; writes.set(path, null) }
    }
    try {
      for (const [path] of output) {
        await mkdir(dirname(path), { recursive: true })
        await rename(join(staging, path), path)
      }
      for (const path of obsolete) await rm(path)
    } catch (error) {
      for (const [path, before] of writes) {
        if (before === null) await rm(path, { force: true })
        else await writeFile(path, before)
      }
      throw error
    }
    console.log(`Synced latest ${prompts.length} of ${allPrompts.length} prompts into 14 catalogs, 2 READMEs and the source-code index`)
  } finally { await rm(staging, { recursive: true, force: true }) }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
