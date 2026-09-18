# Add something worth building

We welcome Astra games, interactive websites, explorable scenes, simulations and Blender projects with a visible result and a traceable source.

[Suggest an example](https://github.com/TripoGrowthLab/awesome-astra-prompts/issues/new) with the original author, post URL, date, preview and any available prompt, repository or demo. Search the catalogs first to avoid duplicates. Check the author's replies for missing context. Respect creator attribution and removal requests.

Maintainers curate the accepted content and its translations in Growth CMS. Keep provenance accurate in the CMS evidence fields; do not present reconstructed text as the author's original words. Imported examples require their original source URL and author credit. Original projects marked `source.platform=internal` require author credit but may omit an external source post; the catalog does not invent a source link. Only published Astra records are synchronized. A CMS editor must complete the localized title and prompt for all 14 languages before publication.

## Development

Use Node.js 22.16 or newer. The existing Markdown can be read and checked without a CMS account.

```sh
npm ci
npm run check
```

For a live refresh, copy `.env.example` to `.env.local` and supply a read-only CMS User API Key. Keep that file private.

```sh
npm run verify:cms
npm run sync
npm run check
# Check that the committed output still matches the live CMS:
npm run sync -- --check
```

The generated catalogs, READMEs, source-code index and preview images are output artifacts. Edit content in CMS and presentation in `scripts/lib/render.mjs` or `scripts/lib/locales.mjs`. Do not edit generated Markdown directly. There is no local source dataset or legacy website-export fallback.

## Scheduled publishing

[Sync prompts](https://github.com/TripoGrowthLab/awesome-astra-prompts/actions/workflows/sync-prompts.yml) runs twice daily at 00:23 and 12:23 UTC (08:23 and 20:23 Asia/Shanghai), and supports manual dispatch. GitHub schedules can be delayed; public repository schedules may be disabled after 60 days without repository activity. Workflow status and logs are the source of truth for each run.

Repository secret `CMS_API_KEY` is required. Optional repository variable `CMS_URL` overrides the default CMS origin. The job runs only on the canonical repository. Pull-request checks never receive the CMS key. The sync job uses a read-only CMS identity and a repository-scoped GitHub token to commit validated output.

The job resolves the Astra model by slug, reads all published records with pagination and locale fallback disabled, and requires complete localized titles and prompts. Translation is managed in CMS; this repository does not enqueue or regenerate translations. Draft and review records stay out of the public collection.

The catalog body displays at most the latest 100 examples by source publication time (or CMS publication time for original projects), with a stable ID tie-break, preserving CMS presentation order within that selection. This limit applies to every language, both READMEs and the source-code index. Featured projects are selected independently from all published examples: up to four CMS editorial picks, in editorial order. Their cards remain visible as newer examples enter the catalog. A featured prompt outside the latest 100 links to its localized public detail page instead of a missing local anchor. When more examples exist, a localized link below the catalog leads to the full official gallery. The sync manifest records the catalog IDs, featured IDs and total published count separately. Media preparation covers the union of the latest and featured selections; unused older images are removed on the next sync.

Images from the CMS public media domain are downloaded without credentials, verified, and stored as repository assets. The legacy CMS file endpoint remains supported with authentication; the CMS key is never sent to the public media domain or redirected to another host. Only published prompt images and, when no images exist, the related video's cover image are exported. Video-only and text prompts remain in every language catalog and can appear as featured cards without a broken thumbnail. Unchanged images reuse a verified checksum; new featured thumbnails preserve the full frame in a 16:10 letterbox. Every example and preview links to its localized Tripo prompt detail page; source videos are intentionally not exposed as a competing catalog action.

Pagination errors, missing translations, invalid images, or concurrent CMS edits stop the run before updating generated files. Staged output passes link and checksum validation first. Local write errors roll back; a successful GitHub run publishes all output in one commit. Content removals in CMS remove the corresponding generated entries and unused images on the next successful sync. Empty collections are rejected for review.

Raw CMS records, private media URLs, user details, source snapshots and credentials are never committed. `docs/sync-manifest.json` contains only public IDs, coverage counts and output checksums; `assets/manifest.json` records generated media checksums and public attribution. Neither is an editable prompt dataset.
