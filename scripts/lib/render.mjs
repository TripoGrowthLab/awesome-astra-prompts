import { locales, repository } from './locales.mjs'

export const html = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const md = value => html(value).replace(/[\\\[\]|*_`]/g, char => `\\${char}`).replace(/\r?\n/g, ' ')
const linkURL = url => url.replaceAll('(', '%28').replaceAll(')', '%29')
const link = (label, url) => `[${md(label)}](${linkURL(url)})`
const root = `https://github.com/${repository}`
const generated = '<!-- Generated from Growth CMS. Update content in CMS; run npm run sync. -->'
const publicPage = (prompt, locale) => prompt.hasDetailPage ? `https://www.tripo3d.ai${locale.code === 'en' ? '' : `/${locale.code}`}/3d-prompts/${prompt.slug}` : prompt.source
export const languageBadges = (current, prefix) => '<p>\n' + locales.map(locale => {
  const target = locale.code === 'en' ? `${prefix}README.md` : locale.code === 'zh' ? `${prefix}README.zh-CN.md` : `${prefix}docs/catalog.${locale.code}.md`
  const url = `https://img.shields.io/badge/${encodeURIComponent(locale.name.replaceAll('-', '--'))}-${locale.code === current.code ? '✓-238636' : '64748b'}?style=flat-square`
  return `  <a href="${target}"><img alt="${html(locale.name)}" src="${url}"></a>`
}).join('\n') + '\n</p>'

function badges(prompts, locale, prefix) {
  return [
    `[![Awesome](https://awesome.re/badge-flat2.svg)](https://github.com/sindresorhus/awesome)`,
    `[![GitHub stars](https://img.shields.io/github/stars/${repository}?style=flat-square&color=f5c542)](${root}/stargazers)`,
    `[![License: MIT](https://img.shields.io/badge/License-MIT-64748b?style=flat-square)](${prefix}LICENSE)`,
    `[![Sync prompts](${root}/actions/workflows/sync-prompts.yml/badge.svg)](${root}/actions/workflows/sync-prompts.yml)`,
    `[![Contributions welcome](https://img.shields.io/badge/PRs-welcome-238636?style=flat-square)](${prefix}CONTRIBUTING.md)`,
  ].join(' ') + '\n\n' + languageBadges(locale, prefix)
}
const preview = (prompt, entry, locale, path, width = 840) => `<a href="${html(publicPage(prompt, locale))}"><img src="${path}" width="${width}" loading="lazy" alt="${html(entry.title)}"></a>`
const links = (prompt, locale) => [
  ...(prompt.hasDetailPage ? [link(`${locale.detail} ↗`, publicPage(prompt, locale))] : []),
  ...(prompt.video ? [link(`${locale.video} ↗`, prompt.video)] : []),
  link(locale.source, prompt.source),
  ...(prompt.repository ? [link(locale.repository, prompt.repository)] : []),
  ...(prompt.demo ? [link(locale.demo, prompt.demo)] : []),
  link(locale.back, '#all-prompts'),
].join(' · ')
function fenced(value) {
  const fence = '`'.repeat(Math.max(3, ...[...value.matchAll(/`+/g)].map(match => match[0].length + 1)))
  return `${fence}text\n${value}\n${fence}`
}

export function renderCatalog(prompts, locale, prefix = '') {
  const zh = locale.code === 'zh', en = locale.code === 'en'
  const picks = prompts.filter(p => p.featured).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id, 'en')).slice(0, 4)
  const lines = [generated, '', '# Awesome Astra Prompts', '', badges(prompts, locale, prefix), '',
    `<a href="https://www.tripo3d.ai${en ? '' : `/${locale.code}`}/3d-prompts/models/gpt-6-astra?utm_source=github&amp;utm_medium=referral&amp;utm_campaign=awesome_astra_prompts&amp;utm_content=readme_hero"><img src="${prefix}assets/hero.webp" width="100%" alt="Awesome Astra Prompts"></a>`, '',
    `**${locale.intro}**`, '',
    en ? 'Explore GPT-6 Astra prompts and 3D examples for Blender, Three.js, Unreal Engine, Unity and the browser.' : zh ? '探索 GPT-6 Astra 在 Blender、Three.js、Unreal Engine、Unity 和浏览器中的提示词与 3D 作品。' : '', '',
    en ? `**${prompts.length} examples · ${locales.length} languages · ${prompts.filter(p => p.repository).length} examples with source code**` : zh ? `**${prompts.length} 条案例 · ${locales.length} 种语言 · ${prompts.filter(p => p.repository).length} 条附项目源码**` : `**${prompts.length} · ${locale.title}**`, '',
  ]
  if (picks.length) {
    lines.push(`## ${locale.featured}`, '', '<table>')
    for (let i = 0; i < picks.length; i += 2) {
      lines.push('<tr>')
      for (const prompt of picks.slice(i, i + 2)) {
        const entry = prompt.translations[locale.code]
        lines.push(`<td width="50%" valign="top">${preview(prompt, entry, locale, prefix + prompt.featuredImage, 420)}<br><strong><a href="#${prompt.id}">${html(entry.title)}</a></strong><br><sub><a href="${html(prompt.source)}">${html(prompt.author.name)}</a></sub><br><a href="#${prompt.id}">${html(locale.prompt)} →</a>${prompt.repository ? ` · <a href="${html(prompt.repository)}">GitHub ↗</a>` : ''}</td>`)
      }
      lines.push('</tr>')
    }
    lines.push('</table>', '')
  }
  lines.push('<a id="all-prompts"></a>', '', `## ${locale.title}`, '', '<details>', `<summary>${locale.browse}</summary>`, '')
  for (const prompt of prompts) lines.push(`- ${link(prompt.translations[locale.code].title, '#' + prompt.id)}${prompt.repository ? ' · GitHub' : ''}`)
  lines.push('', '</details>', '')
  // Repeated imported boilerplate adds no information about the actual example.
  const descriptionCounts = new Map()
  for (const prompt of prompts) {
    const description = prompt.translations[locale.code].description
    descriptionCounts.set(description, (descriptionCounts.get(description) || 0) + 1)
  }
  for (const prompt of prompts) {
    const entry = prompt.translations[locale.code]
    lines.push(`<a id="${prompt.id}"></a>`, '', `### ${md(entry.title)}`, '', `${link(prompt.author.name, prompt.author.url)} · ${prompt.date}`, '')
    for (const image of prompt.images) lines.push(preview(prompt, entry, locale, prefix + image), '')
    if (entry.description && descriptionCounts.get(entry.description) === 1) lines.push(md(entry.description), '')
    lines.push(`**${locale.prompt}**`, '', fenced(entry.prompt), '', links(prompt, locale), '', '---', '')
  }
  if (en || zh) {
    lines.push(en ? '## Share a good example' : '## 分享好作品', '',
      en ? `[Suggest an example](${root}/issues/new) with the original post, a preview and any available prompt or project repository. See [CONTRIBUTING.md](${prefix}CONTRIBUTING.md).` : `发现了值得尝试的作品？[推荐案例](${root}/issues/new)，附上原帖、预览和可获取的提示词或项目源码。参见[贡献指南](${prefix}CONTRIBUTING.md)。`, '',
      en ? '## Credits' : '## 致谢', '',
      en ? `Curated by [TripoGrowthLab](https://github.com/TripoGrowthLab). Layout inspired by [YouMind’s Awesome GPT Image 2](https://github.com/YouMind-OpenLab/awesome-gpt-image-2). Thanks to every creator who shared their work.` : `由 [TripoGrowthLab](https://github.com/TripoGrowthLab) 整理，排版参考 [YouMind Awesome GPT Image 2](https://github.com/YouMind-OpenLab/awesome-gpt-image-2)。感谢分享作品的创作者。`, '',
      en ? `The banner is conceptual artwork. Example images belong to their credited creators. The [MIT license](${prefix}LICENSE) covers our tooling and original documentation; third-party material retains its owners’ rights. [Attribution and removal requests](${prefix}RIGHTS.md).` : `顶部封面为概念插画，案例图片属于已标注的创作者。[MIT 许可](${prefix}LICENSE)适用于本仓库工具和原创文档，第三方内容保留其原有权利。[署名与移除请求](${prefix}RIGHTS.md)。`, '')
  }
  return lines.join('\n').replace(/\n{4,}/g, '\n\n\n')
}

export function renderAll(prompts) {
  const output = new Map()
  for (const locale of locales) output.set(`docs/catalog.${locale.code}.md`, renderCatalog(prompts, locale, '../'))
  output.set('README.md', renderCatalog(prompts, locales.find(l => l.code === 'en')))
  output.set('README.zh-CN.md', renderCatalog(prompts, locales.find(l => l.code === 'zh')))
  const lines = [generated, '', '# Start with source code', '', '[← Awesome Astra Prompts](../README.md)', '', 'Explore the linked projects and check their own licenses before reuse.', '']
  const repos = [...new Set(prompts.map(p => p.repository).filter(Boolean))]
  for (const repo of repos) {
    lines.push(`## ${link(repo.replace('https://github.com/', ''), repo)}`, '')
    for (const p of prompts.filter(p => p.repository === repo)) lines.push(`- ${link(p.translations.en.title, `catalog.en.md#${p.id}`)} · ${link(p.author.name, p.source)}`)
    lines.push('')
  }
  output.set('docs/with-code.md', lines.join('\n'))
  return output
}
