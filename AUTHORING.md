# Authoring notes

Working notes for adding poems and photographs to this repository.

## Layout

```
haikus/YYYY/YYYY-MM-DD-slug.md   one poem per file, front matter + three lines
media/YYYY/<name>.jpg            photographs, max 1600px on the long side, no EXIF
schema/haiku.schema.json         the front matter contract
scripts/validate.mjs             checks every poem against the schema and extra rules
```

Files are organised by date, never by place or type. Classification
lives in the front matter. A file may be renamed or moved; its `id`
must never change.

## Adding a poem

1. Create `haikus/YYYY/YYYY-MM-DD-slug.md` where the date is the day of
   the experience. Several poems on one day are fine; give each a
   different slug.
2. Fill in the front matter. Required: `id`, `title`, `date`, `type`,
   `author`, `status`. See the schema or copy an existing file.
3. Write the poem as the body, one line per line.
4. Keep `status: draft` until it is ready, then set `status: published`.
   Drafts never reach the website, but **this repository is public, so a
   draft committed here is readable by anyone browsing GitHub**.
5. Commit to `main`. The site rebuilds and deploys within a few minutes.

To check locally before committing:

```
npm install
npm run validate
```

### Front matter fields

| Field | Required | Notes |
|---|---|---|
| `id` | yes | `ht-YYYYMMDD-slug`. Immutable. Used in the poem's web address. |
| `title` | yes | Short. |
| `date` | yes | `YYYY-MM-DD`, the day of the experience, local time where you were. |
| `type` | yes | One of `travel`, `food`, `people`, `nature`, `everyday`. |
| `author` | yes | `Gavin Tomlins`. |
| `status` | yes | `draft` or `published`. |
| `created`, `updated` | no | `YYYY-MM-DD`. |
| `tags` | no | Free-form list, lower case. |
| `location` | no | `name`, `country`, and optional `coordinates` (`lat`, `lng`). Only `name` and `country` are ever published. |
| `media.images` | no | List of `{ src, alt, caption }`. `src` is relative to the repo root, e.g. `media/2026/kyoto-lantern.jpg`. |
| `notes` | no | Private. Never published. |
| `language` | no | BCP 47 code, default `en`. |
| `collections` | no | Free-form list for grouping, e.g. a trip name. |

### Photographs

Resize to at most 1600px on the long side and strip all metadata
before committing. Phone photos carry GPS location and time. The
validator rejects any JPEG that still contains an EXIF segment.

```
# macOS: resize with sips, then strip the metadata sips leaves behind
sips -Z 1600 original.jpg --out media/2026/name.jpg
node scripts/strip-metadata.mjs media/2026/name.jpg
npm run validate
```

`scripts/strip-metadata.mjs` needs no dependencies and removes EXIF, XMP,
IPTC and comment segments while keeping the colour profile.

## Sample fixtures

One draft poem tagged `fixture` and titled "Sample fixture" is kept
permanently. It never appears on the site; its only job is to give the
site's leak check something to catch. Leave it as a draft.
