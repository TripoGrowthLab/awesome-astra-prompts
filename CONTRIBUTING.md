# Add something worth building

We welcome Astra examples with a visible result and a traceable source. Games, interactive websites, explorable scenes, simulations and Blender projects all belong here.

## Before submitting

1. Search `data/prompts.json` for the source-post ID and project title. A different repost or camera angle of the same work is not automatically a new example.
2. Include the original author, post URL, date and a useful preview image. Check the author's replies for the full prompt, demo or repository. Link the exact project; do not guess a repository from an account name.
3. Label evidence honestly. Use `verbatim` only when the author published the prompt text. Otherwise write a clearly labeled `source-derived` brief. Never imply that an unpublished prompt was recovered.
4. Include repository and demo links when available. Check the repository license before calling it open source. Third-party source code belongs in its original repository, not copied into this one.
5. Keep author attribution and respect rights/removal requests. Do not upload credentials, private conversations, raw research logs or engagement metrics.

An issue with these details is enough; you do not have to translate fourteen languages yourself. Maintainers can curate and localize an accepted contribution before adding it to the dataset. Translations should preserve the task and technical terms, not add capabilities or promises absent from the source.

## Maintainer checks

Use Node.js 22 or newer. No package install or service credentials are needed to validate an existing checkout.

```sh
npm run catalog
npm run check
```

For a source snapshot refresh, use the optional exporter described in [the data guide](data/README.md), then `npm run vendor-media`, `npm run featured-media` and `npm run catalog`. Review every data change before committing. The media step fetches public source files and updates checksums; it does not write to a CMS. Featured thumbnail generation requires installed `ffmpeg` and `cwebp` commands, preserves full source frames, and writes separate 16:10 WebP previews. It never changes the full-size source images.

`data/prompts.json` carries the website's ordered `featuredIds`, so the two galleries use one selection. Keep video URLs in the independent `media.video` field. README previews link to the localized web detail page; direct video links remain available because GitHub does not reliably autoplay external videos.

Update all locale records, counts and manifests together. Preserve stable IDs. Do not replace source screenshots with AI-generated illustrations. The cover artwork is separately identified as conceptual.
