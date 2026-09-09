import { modelSlug } from './locales.mjs'

export const CATALOG_LIMIT = 100

// Choose the newest source publications, then preserve CMS presentation order.
// The same selection feeds media, every language, featured cards and the code index.
export function selectCatalog(prompts) {
  const ids = new Set([...prompts].sort((a, b) =>
    (b.publishedAt || b.date).localeCompare(a.publishedAt || a.date) || b.id.localeCompare(a.id, 'en', { numeric: true })
  ).slice(0, CATALOG_LIMIT).map(p => p.id))
  return prompts.filter(p => ids.has(p.id))
}

const copy = {
  en: ['Latest Astra prompts', 'Showing the latest {count} examples. Discover more on the official site.', 'Explore all {total} examples'],
  zh: ['最新 Astra 提示词', '这里收录最新 {count} 条案例，更多灵感尽在官网。', '前往官网查看全部 {total} 条案例'],
  'zh-Hant': ['最新 Astra 提示詞', '這裡收錄最新 {count} 個案例，更多靈感盡在官網。', '前往官網查看全部 {total} 個案例'],
  ja: ['最新の Astra プロンプト', '最新の作例 {count} 件を掲載しています。さらに多くの作例は公式サイトで。', '全 {total} 件の作例を公式サイトで見る'],
  ko: ['최신 Astra 프롬프트', '최신 사례 {count}개를 소개합니다. 공식 사이트에서 더 많은 영감을 찾아보세요.', '공식 사이트에서 전체 사례 {total}개 보기'],
  es: ['Últimos prompts de Astra', 'Aquí encontrarás los {count} ejemplos más recientes. Descubre más en el sitio oficial.', 'Ver los {total} ejemplos en el sitio oficial'],
  pt: ['Prompts mais recentes do Astra', 'Confira os {count} exemplos mais recentes. Encontre mais inspiração no site oficial.', 'Ver todos os {total} exemplos no site oficial'],
  de: ['Neueste Astra-Prompts', 'Hier findest du die {count} neuesten Beispiele. Weitere Inspiration gibt es auf der offiziellen Website.', 'Alle {total} Beispiele auf der offiziellen Website ansehen'],
  fr: ['Derniers prompts Astra', 'Découvrez les {count} exemples les plus récents. Retrouvez davantage d’inspiration sur le site officiel.', 'Voir les {total} exemples sur le site officiel'],
  it: ['Prompt Astra più recenti', 'Qui trovi i {count} esempi più recenti. Scopri altre idee sul sito ufficiale.', 'Esplora tutti i {total} esempi sul sito ufficiale'],
  ru: ['Новые промпты Astra', 'Здесь собраны последние {count} примеров. Ещё больше идей — на официальном сайте.', 'Все {total} примеров на официальном сайте'],
  tr: ['En yeni Astra istemleri', 'En yeni {count} örnek burada. Daha fazla ilham için resmî siteyi ziyaret edin.', 'Resmî sitede {total} örneğin tümünü keşfet'],
  uk: ['Нові промпти Astra', 'Тут зібрано найновіші приклади: {count}. Ще більше ідей — на офіційному сайті.', 'Усі приклади на офіційному сайті: {total}'],
  vi: ['Prompt Astra mới nhất', 'Khám phá {count} ví dụ mới nhất tại đây. Tìm thêm cảm hứng trên trang chính thức.', 'Xem toàn bộ {total} ví dụ trên trang chính thức'],
}

export const catalogTitle = locale => copy[locale.code][0]
export function galleryNotice(locale, count, total, placement) {
  if (total <= count) return ''
  const fill = text => text.replace('{count}', count).replace('{total}', total)
  const url = `https://www.tripo3d.ai${locale.code === 'en' ? '' : `/${locale.code}`}/3d-prompts/models/${modelSlug}?utm_source=github&utm_medium=referral&utm_campaign=awesome_astra_prompts&utm_content=catalog_${placement}`
  return `> ${fill(copy[locale.code][1])}\n>\n> **[${fill(copy[locale.code][2])} →](${url})**`
}
