# Dataset guide

This directory is a readable JSON snapshot of the Astra prompt collection prepared for [Tripo](https://www.tripo3d.ai/3d-prompts/models/gpt-6-astra). It requires no CMS, account or runtime service to read. The complete data and catalogs in this repository are available independently of the website.

## Files

- `prompts.json`: English records, source attribution, evidence labels, public project links and media references.
- `locales/{locale}.json`: localized titles, descriptions, complete prompt text, evidence notes, tags and localized page links. Records are keyed by the same stable prompt ID as the English dataset.
- `repositories.json`: distinct linked public repositories, their related prompt IDs, source posts and available demos. A public repository is not automatically licensed for reuse: check its license.
- `manifest.json`: snapshot date, counts, source date range and SHA-256 hashes of the generated data files. The date is an export date, not a claim of fresh verification of every external link.

## Reading the evidence

`evidence.kind` is one of:

- `verbatim`: the author published the prompt wording. Light punctuation or formatting normalization may have been applied. A localized version is a translation, not literal original-language wording.
- `source-derived`: a reusable brief reconstructed from the author's public project description. This does **not** claim access to an unpublished prompt or guarantee that it reproduces the showcased result.

`originalPrompt` is included only when a reliable original-language capture exists separately from the English version. Its absence must not be interpreted as proof that the English text was the author's original wording. `source.language` identifies the source post's language. Optional `sourceExcerpt: true` marks an incomplete captured passage, when applicable; never silently complete such a passage.

Titles and descriptions are editorial summaries. Examples are references to adapt across models, not controlled model benchmarks. Linked images, videos, author text and third-party projects retain their respective owners' rights; their presence here does not grant a new license to those works. Keep author and source attribution when displaying entries.

## Field boundaries

`id` is the original X/Twitter post ID, stored as a **string** to avoid integer precision loss. `slug` is a stable editorial topic followed by that ID, for example `gogh-strike-multiplayer-fps-2096013280519016608`. Localized records and repository references use `id`; public page links use `slug`. The website resolves the trailing ID regardless of the incoming prefix, without redirecting, and uses the official topic + ID URL as canonical.

The export intentionally excludes engagement metrics, internal media IDs, API credentials, raw research logs, private repository identifiers and local filesystem paths. `links.tripo` and localized `pageUrl` point to the full example; `links.repository` and `links.demo` are optional, separately attributed external destinations.

`media.image` is a repository-relative WebP path into `assets/previews/`. When the source has a video, its CMS-hosted URL is retained separately as `media.video`; the image is its source thumbnail or an extracted frame. `assets/manifest.json` records public image origins and checksums for attribution and integrity. A media reference is not a redistribution license.

The top-level `featuredIds` array preserves the ordered website selection from `shared/data/prompt-featured.json` in the source checkout. README featured cards use separate, uniformly sized 16:10 previews in `assets/featured/`. Letterboxing preserves the complete frame without cropping or distortion. The full catalog always retains the original preview image. README images link to localized detail pages; video entries also expose a direct playback link, without relying on unsupported GitHub autoplay.

## Regenerating a snapshot

From the repository root:

```sh
node scripts/export-from-homepage.mjs --source /path/to/source-checkout --date YYYY-MM-DD
npm run vendor-media
npm run featured-media
npm run catalog
npm run check
```

The source checkout must have its dependencies installed. The exporter imports the **final merged `PROMPTS` export**, including repository-link enrichment, rather than an initial collection batch. It uses the source project's FNV-1a key helper and raw locale catalogs; missing translations fail the export instead of silently falling back to English. TypeScript is bundled in memory with the source checkout's esbuild dependency. No source files are changed and no dependencies are installed.

Regeneration replaces these JSON snapshots with current source values. Existing repository-local previews are reused by their public source URL after checksum verification; their ID references and manifest hashes are refreshed automatically. Newly added previews still need the repository's media-localization step before validation and publication.
