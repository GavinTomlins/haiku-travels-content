| `haiku-modern` | Three lines (5-7-5); no season word or cut required. |# Authoring notes

Working notes for adding poems and photographs to this repository.

## Layout

```
haikus/YYYY/YYYY-MM-DD-slug.md   one poem per file, front matter + the verse
media/YYYY/HaikuTravels-<name>.jpg  sketches and photographs, max 1600px, copyright-stamped
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
3. Write the poem as the body, one line per line (see "Forms" below for
   tanka, haibun and renku).
4. Keep `status: draft` until it is ready, then set `status: published`.
   Drafts never reach the website, but **this repository is public, so a
   draft committed here is readable by anyone browsing GitHub**.
5. Commit to `main`. The site rebuilds and deploys within a few minutes.

The usual way to do all of this is the generator app in the sibling
`haikutravels-generator` repository: it drafts options, makes the sketch,
converts and stamps it, writes this file, runs the validator and pushes.
The steps above are the manual fallback.

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
| `form` | no | One of `haiku-traditional` (default), `haiku-modern`, `senryu`, `tanka`, `haibun`, `renku`. Sets the body layout below. |
| `author` | yes | `Gavin Tomlins`, `Gavin & Natasha Tomlins` or `Natasha Tomlins`. The site shows a GT, GNT or NT mark inside the ensō from this. |
| `status` | yes | `draft` or `published`. |
| `created`, `updated` | no | `YYYY-MM-DD`. |
| `order` | no | Whole number from 1. Only matters when several poems share a `date`: lower numbers come first, nearer the front of the book. |
| `tags` | no | Free-form list, lower case. |
| `location` | no | `name`, `country`, and optional `coordinates` (`lat`, `lng`). Only `name` and `country` are ever published. |
| `media.images` | no | List of `{ src, alt, caption }`. `src` is relative to the repo root, e.g. `media/2026/kyoto-lantern.jpg`. |
| `notes` | no | Private. Never published. |
| `language` | no | BCP 47 code, default `en`. |
| `collections` | no | Free-form list for grouping, e.g. a trip name. |

### Forms

The body is the verse, one line per line. Line counts are only warnings
from the validator, because a poem may break the pattern on purpose;
missing structure is an error.

| Form | Body |
|---|---|
| `haiku-traditional`, `senryu` | Three lines (5-7-5). |
| `haiku-modern` | One to four lines, free. |
| `tanka` | Five lines (5-7-5-7-7). |
| `haibun` | Prose paragraphs, then a line holding only `---`, then a three-line haiku. |
| `renku` | Stanzas separated by one blank line, alternating three lines and two lines. |

A haibun:

```
---
id: ht-20260912-one-pub-town
...
form: haibun
---
We drove into town at dusk. One pub, one servo, one IGA.

The steak was the best in a decade.
---
cold wind off the lake
the pub light the only light
steak and a quiet beer
```

### Sketches and photographs

Drop raw files in `originals/` (ignored by git). Every image that is
committed is named `HaikuTravels-<name>.jpg`, at most 1600px on the long
side, and stamped: all metadata stripped (phone photos carry GPS location
and time), then the copyright written back as EXIF and XMP so a copy taken
from the site still says "© Gavin Tomlins <year> - Haiku Travels" and links
to the licence page. The validator rejects unstamped, unprefixed or
duplicate names.

```
# macOS: resize (and convert a PNG) with sips, then stamp
sips -s format jpeg -s formatOptions 88 -Z 1600 originals/sketch.png --out media/2026/HaikuTravels-name.jpg
node scripts/stamp-metadata.mjs media/2026/HaikuTravels-name.jpg
npm run validate
```

`scripts/stamp-metadata.mjs` needs no dependencies. The year in the notice
is the media folder's. `scripts/strip-metadata.mjs` only strips, for the
rare image that must carry no notice.

## Sample fixtures

One draft poem tagged `fixture` and titled "Sample fixture" is kept
permanently. It never appears on the site; its only job is to give the
site's leak check something to catch. Leave it as a draft.
