#!/usr/bin/env node
/** Export a public, allowlisted Astra snapshot from a local source checkout. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  source: { type: 'string' },
  date: { type: 'string' },
  help: { type: 'boolean' },
} });
if (values.help) {
  console.log('Usage: node scripts/export-from-homepage.mjs --source /path/to/source-checkout [--date YYYY-MM-DD]');
  process.exit(0);
}
if (!values.source) throw new Error('--source is required; no private checkout path is embedded in this script.');
const source = resolve(values.source);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const snapshotDate = values.date ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate) || Number.isNaN(Date.parse(snapshotDate))) throw new Error('Invalid --date; expected YYYY-MM-DD.');

// Use the source checkout's installed build tool. No dependencies are installed
// and no source files or intermediate bundles are written to that checkout.
const sourceRequire = createRequire(join(source, 'package.json'));
let build;
try { ({ build } = sourceRequire('esbuild')); }
catch { ({ build } = createRequire(sourceRequire.resolve('vite'))('esbuild')); }
const bundled = await build({
  stdin: {
    contents: `export { PROMPTS } from ${JSON.stringify(join(source, 'shared/data/prompts.ts'))};\nexport { promptCopyKey } from ${JSON.stringify(join(source, 'shared/utils/prompt-copy-key.ts'))};\nexport { locales } from ${JSON.stringify(join(source, 'i18n/locales.ts'))};`,
    resolveDir: source,
    loader: 'ts',
  },
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
});
const { PROMPTS, promptCopyKey, locales: configuredLocales } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const MODEL = 'gpt-6-astra';
const ORIGIN = 'https://www.tripo3d.ai';
const homepage = `${ORIGIN}/3d-prompts/models/${MODEL}`;
const selected = PROMPTS.filter(entry => entry.model === MODEL);
if (!selected.length) throw new Error('No Astra prompts found in final PROMPTS export.');
const locales = configuredLocales.map(entry => entry.code);
if (new Set(locales).size !== locales.length) throw new Error('Duplicate locale code.');
const catalogs = Object.fromEntries(await Promise.all(locales.map(async locale => {
  const catalog = JSON.parse(await readFile(join(source, 'i18n/locales/prompts', `${locale}.json`), 'utf8'));
  if (!catalog.promptLibrary) throw new Error(`Missing raw catalog: ${locale}`);
  return [locale, catalog.promptLibrary];
})));
function localized(english, locale) {
  const value = catalogs[locale][promptCopyKey(english)];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${locale} translation for ${promptCopyKey(english)}`);
  return value;
}
function publicUrl(value, field) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`Invalid ${field} URL`); }
  if (url.protocol !== 'https:' || url.username || url.password || ['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error(`Non-public ${field} URL`);
  return value;
}
const ids = new Set();
// Reuse verified vendored previews by source URL, not the changeable editorial slug.
let assetManifest;
try { assetManifest = JSON.parse(await readFile(join(root, 'assets/manifest.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const localImages = new Map((assetManifest?.files ?? []).map(file => [file.sourceUrl, file]));
for (const file of localImages.values()) {
  if (!/^assets\/previews\/[a-z0-9.-]+$/.test(file.path)) throw new Error('Invalid vendored preview path');
  const bytes = await readFile(join(root, file.path));
  if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`Preview checksum mismatch: ${file.path}`);
}
const prompts = selected.map(entry => {
  if (!/^[1-9]\d{9,24}$/.test(entry.id) || !entry.sourceUrl.endsWith(`/status/${entry.id}`)) throw new Error('Invalid tweet ID');
  if (ids.has(entry.id)) throw new Error(`Duplicate prompt ID: ${entry.id}`);
  ids.add(entry.id);
  if (!['source-derived', 'verbatim'].includes(entry.evidence?.kind)) throw new Error(`Missing evidence classification: ${entry.slug}`);
  if (!entry.video?.poster) throw new Error(`Missing image: ${entry.slug}`);
  const record = {
    id: entry.id,
    slug: entry.slug,
    model: MODEL,
    title: entry.title.en,
    description: entry.description.en,
    prompt: entry.prompt.en,
    author: { name: entry.author.name, url: publicUrl(entry.author.url, 'author') },
    source: { url: publicUrl(entry.sourceUrl, 'source'), publishedAt: entry.publishedAt, language: entry.language },
    evidence: { kind: entry.evidence.kind, note: entry.evidence.note.en },
    tags: [...entry.keywords],
    links: {
      tripo: `${ORIGIN}/3d-prompts/${entry.slug}`,
      ...(entry.links?.repository ? { repository: publicUrl(entry.links.repository, 'repository') } : {}),
      ...(entry.links?.liveDemo ? { demo: publicUrl(entry.links.liveDemo, 'demo') } : {}),
    },
    media: { image: localImages.get(entry.video.poster)?.path ?? publicUrl(entry.video.poster, 'image'), ...(entry.video.url ? { video: publicUrl(entry.video.url, 'video') } : {}) },
    ...(entry.originalPrompt ? { originalPrompt: entry.originalPrompt } : {}),
    ...(entry.sourceExcerpt ? { sourceExcerpt: true } : {}),
  };
  // Validate every translated field before writing any output. Raw catalog
  // strings preserve code punctuation instead of Vue-i18n compiler escapes.
  for (const locale of locales) for (const text of [record.title, record.description, record.prompt, record.evidence.note, ...record.tags]) localized(text, locale);
  return record;
});
const files = new Map();
const addJson = (path, data) => files.set(path, `${JSON.stringify(data, null, 2)}\n`);
addJson('data/prompts.json', { schemaVersion: 1, model: { id: MODEL, name: 'GPT-6 Astra' }, homepage, locales, count: prompts.length, prompts });
for (const locale of locales) {
  addJson(`data/locales/${locale}.json`, {
    locale, model: MODEL, count: prompts.length,
    prompts: Object.fromEntries(prompts.map(entry => [entry.id, {
      title: localized(entry.title, locale),
      description: localized(entry.description, locale),
      prompt: localized(entry.prompt, locale),
      evidenceNote: localized(entry.evidence.note, locale),
      tags: entry.tags.map(tag => localized(tag, locale)),
      pageUrl: `${ORIGIN}${locale === 'en' ? '' : `/${locale}`}/3d-prompts/${entry.slug}`,
    }])),
  });
}
const repositories = new Map();
for (const entry of prompts) {
  if (!entry.links.repository) continue;
  const url = entry.links.repository.replace(/\/$/, '');
  const item = repositories.get(url) ?? { url, promptIds: [], sourceUrls: [], demoUrls: [] };
  item.promptIds.push(entry.id);
  for (const [key, value] of [['sourceUrls', entry.source.url], ['demoUrls', entry.links.demo]]) {
    if (value && !item[key].includes(value)) item[key].push(value);
  }
  repositories.set(url, item);
}
addJson('data/repositories.json', {
  schemaVersion: 1, model: MODEL, count: repositories.size,
  promptCount: prompts.filter(entry => entry.links.repository).length,
  repositories: [...repositories.values()].sort((a, b) => a.url.localeCompare(b.url)),
});
const published = prompts.map(entry => entry.source.publishedAt).sort();
if (assetManifest) {
  assetManifest.files = assetManifest.files.map(file => ({
    ...file,
    promptIds: prompts.filter(prompt => prompt.media.image === file.path).map(prompt => prompt.id),
  })).filter(file => file.promptIds.length);
  addJson('assets/manifest.json', assetManifest);
}
addJson('data/manifest.json', {
  schemaVersion: 1, snapshotDate, source: { name: 'Tripo 3D Prompts', url: homepage },
  model: MODEL, count: prompts.length, locales,
  evidenceCounts: Object.fromEntries(['verbatim', 'source-derived'].map(kind => [kind, prompts.filter(entry => entry.evidence.kind === kind).length])),
  repositoryCount: repositories.size,
  promptsWithRepository: prompts.filter(entry => entry.links.repository).length,
  promptsWithDemo: prompts.filter(entry => entry.links.demo).length,
  mediaCounts: { images: prompts.filter(entry => entry.media.image).length, videos: prompts.filter(entry => entry.media.video).length },
  originalPromptCount: prompts.filter(entry => entry.originalPrompt).length,
  sourceExcerptCount: prompts.filter(entry => entry.sourceExcerpt).length,
  sourcePublishedRange: { from: published[0], to: published.at(-1) },
  files: [...files].map(([path, text]) => ({ path, sha256: createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text) })),
});
for (const [path, contents] of files) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), contents);
}
console.log(JSON.stringify({ prompts: prompts.length, locales: locales.length, repositories: repositories.size, promptsWithRepository: prompts.filter(entry => entry.links.repository).length, evidence: Object.fromEntries(['verbatim', 'source-derived'].map(kind => [kind, prompts.filter(entry => entry.evidence.kind === kind).length])), files: files.size }, null, 2));
