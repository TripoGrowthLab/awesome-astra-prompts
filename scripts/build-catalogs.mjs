import { readFile, writeFile } from 'node:fs/promises'

const read = async path => JSON.parse(await readFile(path, 'utf8'))
const dataset = await read('data/prompts.json')
const manifest = await read('data/manifest.json')
const check = process.argv.includes('--check')
const text = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const md = value => text(value).replace(/[\[\]|]/g, char => `\\${char}`)
const labels = {
  en: ['English', 'All Astra examples', 'Source-derived brief', 'Published prompt', 'Original post', 'Source code', 'Live demo', 'Preview'],
  zh: ['简体中文', 'Astra 完整案例目录', '来源整理稿', '已公开提示词', '查看原帖', '项目源码', '在线演示', '作品预览'],
  es: ['Español', 'Todos los ejemplos de Astra', 'Instrucciones elaboradas a partir de la fuente', 'Prompt publicado', 'Publicación original', 'Código fuente', 'Demo en línea', 'Vista previa'],
  ko: ['한국어', 'Astra 전체 사례', '공개 설명을 바탕으로 정리한 작업 지침', '공개된 프롬프트', '원본 게시물', '소스 코드', '데모', '미리보기'],
  ru: ['Русский', 'Все примеры Astra', 'Задание по описанию автора', 'Опубликованный промпт', 'Исходная публикация', 'Исходный код', 'Демо', 'Предпросмотр'],
  pt: ['Português', 'Todos os exemplos do Astra', 'Instruções elaboradas a partir da fonte', 'Prompt publicado', 'Publicação original', 'Código-fonte', 'Demonstração', 'Prévia'],
  ja: ['日本語', 'Astra の全作例', '公開説明からまとめた制作指示', '公開されたプロンプト', '元の投稿', 'ソースコード', 'デモ', 'プレビュー'],
  tr: ['Türkçe', 'Tüm Astra örnekleri', 'Kaynak açıklamadan derlenen görev', 'Yayımlanmış istem', 'Orijinal gönderi', 'Kaynak kodu', 'Canlı demo', 'Önizleme'],
  de: ['Deutsch', 'Alle Astra-Beispiele', 'Aus der Projektbeschreibung abgeleiteter Arbeitsauftrag', 'Veröffentlichter Prompt', 'Originalbeitrag', 'Quellcode', 'Live-Demo', 'Vorschau'],
  fr: ['Français', 'Tous les exemples Astra', 'Consigne tirée de la description du projet', 'Prompt publié', 'Publication originale', 'Code source', 'Démo', 'Aperçu'],
  it: ['Italiano', 'Tutti gli esempi Astra', 'Istruzioni ricavate dalla descrizione del progetto', 'Prompt pubblicato', 'Post originale', 'Codice sorgente', 'Demo', 'Anteprima'],
  'zh-Hant': ['繁體中文', 'Astra 完整案例目錄', '依來源整理的指令', '已公開提示詞', '查看原文', '專案原始碼', '線上展示', '作品預覽'],
  uk: ['Українська', 'Усі приклади Astra', 'Завдання за описом автора', 'Опублікований промпт', 'Оригінальний допис', 'Вихідний код', 'Демо', 'Попередній перегляд'],
  vi: ['Tiếng Việt', 'Toàn bộ ví dụ Astra', 'Yêu cầu được biên soạn từ mô tả gốc', 'Prompt đã công bố', 'Bài đăng gốc', 'Mã nguồn', 'Bản demo', 'Ảnh xem trước'],
}
const write = async (path, contents) => {
  if (check) {
    if (await readFile(path, 'utf8') !== contents) throw new Error(`Stale generated content: ${path}; run npm run catalog`)
  } else await writeFile(path, contents)
}
const sorted = [...dataset.prompts].sort((a, b) => Number(Boolean(b.links.repository)) - Number(Boolean(a.links.repository)))
const localizations = {}
for (const locale of dataset.locales) {
  const localized = await read(`data/locales/${locale}.json`)
  localizations[locale] = localized
  const [name, title, derived, published, source, code, demo, preview] = labels[locale]
  const lines = [`# ${title}`, '', `[← Awesome Astra Prompts](../${locale === 'zh' ? 'README.zh-CN.md' : 'README.md'}) · ${name} · ${dataset.count}`, '', '<!-- Generated from data/*.json. Edit the data, then run npm run catalog. -->', '']
  for (const prompt of sorted) {
    const entry = localized.prompts[prompt.id]
    const kind = prompt.evidence.kind === 'verbatim' ? published : derived
    lines.push(`- [${md(entry.title)}](#${prompt.id})${prompt.links.repository ? ' · GitHub' : ''}`)
  }
  lines.push('')
  for (const prompt of sorted) {
    const entry = localized.prompts[prompt.id]
    const kind = prompt.evidence.kind === 'verbatim' ? published : derived
    lines.push(`<a id="${prompt.id}"></a>`, '', `## ${md(entry.title)}`, '', `[${md(prompt.author.name)}](${prompt.author.url}) · ${prompt.source.publishedAt.slice(0, 10)} · **${kind}**`, '', md(entry.description), '', `<details>`, `<summary>${preview}</summary>`, '', `![${md(entry.title)}](../${prompt.media.image})`, '', '</details>', '', entry.evidenceNote, '', '```text', entry.prompt.replaceAll('```', '`\u200b``'), '```', '', [ `[Tripo ↗](${entry.pageUrl})`, `[${source}](${prompt.source.url})`, ...(prompt.links.repository ? [`[${code}](${prompt.links.repository})`] : []), ...(prompt.links.demo ? [`[${demo}](${prompt.links.demo})`] : []) ].join(' · '), '', '---', '')
  }
  await write(`docs/catalog.${locale}.md`, lines.join('\n'))
}

const picks = ['2096013280519016608', '2095673885605630429', '2095988972879335792', '2095898303019856230', '2095806515579879457', '2095776712579571725'].map(id => dataset.prompts.find(prompt => prompt.id.endsWith(id)))
for (const locale of ['en', 'zh']) {
  const path = locale === 'en' ? 'README.md' : 'README.zh-CN.md'
  let contents = await readFile(path, 'utf8')
  const update = (section, body) => {
    const start = `<!-- generated:${section}:start -->`
    const end = `<!-- generated:${section}:end -->`
    const from = contents.indexOf(start)
    const to = contents.indexOf(end)
    if (from < 0 || to < from) throw new Error(`Missing generated markers: ${path} ${section}`)
    contents = contents.slice(0, from + start.length) + `\n${body}\n` + contents.slice(to)
  }
  update('stats', locale === 'en'
    ? `**${dataset.count} examples** · **${dataset.locales.length} languages** · **${manifest.promptsWithRepository} examples with source code** · **${manifest.evidenceCounts.verbatim} published prompts + ${manifest.evidenceCounts['source-derived']} source-derived briefs**`
    : `**${dataset.count} 条案例** · **${dataset.locales.length} 种语言** · **${manifest.promptsWithRepository} 条附项目源码** · **${manifest.evidenceCounts.verbatim} 条公开提示词 + ${manifest.evidenceCounts['source-derived']} 条来源整理稿**`)
  const cells = picks.map(prompt => {
    const entry = localizations[locale].prompts[prompt.id]
    const catalog = `#${prompt.id}`
    const kind = labels[locale][prompt.evidence.kind === 'verbatim' ? 3 : 2]
    return `<td width="50%" valign="top"><a href="${catalog}"><img src="${prompt.media.image}" width="420" alt="${text(entry.title)}"></a><br><strong><a href="${catalog}">${text(entry.title)}</a></strong><br><sub>${text(kind)} · <a href="${prompt.source.url}">${text(prompt.author.name)}</a></sub><br>${prompt.links.repository ? `<a href="${prompt.links.repository}">GitHub ↗</a> · ` : ''}<a href="${catalog}">${locale === 'en' ? 'Read the prompt' : '阅读提示词'} →</a></td>`
  })
  update('featured', `<table>\n${Array.from({ length: 3 }, (_, i) => `<tr>\n${cells.slice(i * 2, i * 2 + 2).join('\n')}\n</tr>`).join('\n')}\n</table>`)
  update('languages', dataset.locales.map(key => `[${labels[key][0]}](docs/catalog.${key}.md)`).join(' · '))
  const all = ['<a id="all-prompts"></a>', '', locale === 'en' ? '## All Astra prompts' : '## 全部 Astra 提示词', '', locale === 'en' ? `All ${dataset.count} entries are displayed below with their complete prompt text. Examples with project repositories come first.` : `以下直接展示全部 ${dataset.count} 条内容、配图与完整提示词，有项目源码的案例优先。`, '', '<details>', `<summary>${locale === 'en' ? 'Jump to an example' : '展开案例导航'}</summary>`, '']
  for (const prompt of sorted) all.push(`- [${md(localizations[locale].prompts[prompt.id].title)}](#${prompt.id})${prompt.links.repository ? ' · GitHub' : ''}`)
  all.push('', '</details>', '')
  for (const prompt of sorted) {
    const entry = localizations[locale].prompts[prompt.id]
    const kind = labels[locale][prompt.evidence.kind === 'verbatim' ? 3 : 2]
    all.push(`<a id="${prompt.id}"></a>`, '', `### ${md(entry.title)}`, '', `[${md(prompt.author.name)}](${prompt.author.url}) · ${prompt.source.publishedAt.slice(0, 10)} · **${kind}**`, '', `<img src="${prompt.media.image}" width="840" loading="lazy" alt="${text(entry.title)}">`, '', md(entry.description), '', `> ${entry.evidenceNote}`, '', `**${locale === 'en' ? 'Prompt' : '提示词'}**`, '', '```text', entry.prompt.replaceAll('```', '`\u200b``'), '```', '', [`[Tripo ↗](${entry.pageUrl})`, `[${labels[locale][4]}](${prompt.source.url})`, ...(prompt.links.repository ? [`[${labels[locale][5]}](${prompt.links.repository})`] : []), ...(prompt.links.demo ? [`[${labels[locale][6]}](${prompt.links.demo})`] : []), `[${locale === 'en' ? 'Back to all prompts' : '返回提示词导航'}](#all-prompts)`].join(' · '), '', '---', '')
  }
  update('all-prompts', all.join('\n'))
  contents = contents.replaceAll(`docs/catalog.${locale}.md#`, '#')
  await write(path, contents)
}

const repositories = await read('data/repositories.json')
const lines = ['# Start with source code', '', '[← Awesome Astra Prompts](../README.md)', '', 'These repositories are linked to the source posts in the collection. Four examples share three repositories. Check the code, dependencies and license before using a project. A public repository is not automatically open source.', '', 'License snapshot checked on September 6, 2026: `petergpt/gogh-strike` and `emollick/abyssal-living-deep` declare MIT; `alesha-pro/bench-portal` has no detected license. Recheck the current repository before reuse.', '']
for (const repository of repositories.repositories) {
  lines.push(`## [${repository.url.replace('https://github.com/', '')}](${repository.url})`, '')
  for (const id of repository.promptIds) {
    const prompt = dataset.prompts.find(entry => entry.id === id)
    lines.push(`- [${md(prompt.title)}](catalog.en.md#${id}) — [${md(prompt.author.name)} / original post](${prompt.source.url})${prompt.links.demo ? ` · [Live demo](${prompt.links.demo})` : ''}`)
  }
  lines.push('')
}
await write('docs/with-code.md', lines.join('\n'))
console.log(`${check ? 'Checked' : 'Built'} ${dataset.locales.length} full catalogs, two landing READMEs and the code index.`)
