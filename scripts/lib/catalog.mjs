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
  en: ['Latest Astra prompts', 'To keep GitHub README rendering smooth, only the latest {count} examples are shown here.', 'Explore all {total} examples'],
  zh: ['最新 Astra 提示词', '为保持 GitHub README 渲染流畅，这里仅展示最新 {count} 条案例。', '前往官网查看全部 {total} 条案例'],
  'zh-Hant': ['最新 Astra 提示詞', '為保持 GitHub README 渲染流暢，這裡僅展示最新 {count} 個案例。', '前往官網查看全部 {total} 個案例'],
  ja: ['最新の Astra プロンプト', 'GitHub README をスムーズに表示するため、ここでは最新の作例 {count} 件のみを掲載しています。', '全 {total} 件の作例を公式サイトで見る'],
  ko: ['최신 Astra 프롬프트', 'GitHub README가 원활하게 렌더링되도록 최신 사례 {count}개만 표시합니다.', '공식 사이트에서 전체 사례 {total}개 보기'],
  es: ['Últimos prompts de Astra', 'Para que el README de GitHub se renderice con fluidez, aquí solo se muestran los {count} ejemplos más recientes.', 'Ver los {total} ejemplos en el sitio oficial'],
  pt: ['Prompts mais recentes do Astra', 'Para manter a renderização do README do GitHub fluida, mostramos aqui apenas os {count} exemplos mais recentes.', 'Ver todos os {total} exemplos no site oficial'],
  de: ['Neueste Astra-Prompts', 'Damit GitHub die README flüssig darstellen kann, zeigen wir hier nur die {count} neuesten Beispiele.', 'Alle {total} Beispiele auf der offiziellen Website ansehen'],
  fr: ['Derniers prompts Astra', 'Pour préserver la fluidité du rendu du README sur GitHub, seuls les {count} exemples les plus récents sont affichés ici.', 'Voir les {total} exemples sur le site officiel'],
  it: ['Prompt Astra più recenti', 'Per mantenere fluido il rendering del README su GitHub, qui mostriamo solo i {count} esempi più recenti.', 'Esplora tutti i {total} esempi sul sito ufficiale'],
  ru: ['Новые промпты Astra', 'Чтобы README на GitHub отображался без задержек, здесь показаны только последние {count} примеров.', 'Все {total} примеров на официальном сайте'],
  tr: ['En yeni Astra istemleri', 'GitHub README sayfasının akıcı görüntülenmesi için burada yalnızca en yeni {count} örnek gösterilir.', 'Resmî sitede {total} örneğin tümünü keşfet'],
  uk: ['Нові промпти Astra', 'Щоб README на GitHub відображався без затримок, тут показано лише {count} найновіших прикладів.', 'Усі приклади на офіційному сайті: {total}'],
  vi: ['Prompt Astra mới nhất', 'Để README trên GitHub hiển thị mượt mà, chỉ {count} ví dụ mới nhất được trình bày tại đây.', 'Xem toàn bộ {total} ví dụ trên trang chính thức'],
}

export const catalogTitle = locale => copy[locale.code][0]
export function galleryNotice(locale, count, total, placement) {
  if (total <= count) return ''
  const fill = text => text.replace('{count}', count).replace('{total}', total)
  const url = `https://www.tripo3d.ai${locale.code === 'en' ? '' : `/${locale.code}`}/3d-prompts/models/${modelSlug}?utm_source=github&utm_medium=referral&utm_campaign=awesome_astra_prompts&utm_content=catalog_${placement}`
  return `<table align="center">\n<tr><td align="center">\n<br>\n<p><strong><a href="${url.replaceAll('&', '&amp;')}">${fill(copy[locale.code][2])} →</a></strong></p>\n<p><sub>${fill(copy[locale.code][1])}</sub></p>\n<br>\n</td></tr>\n</table>`
}
