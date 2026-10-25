#!/usr/bin/env node
// Validates every poem under haikus/ against schema/haiku.schema.json and
// the rules the schema cannot express. Exit code 1 on any error.
// MIT licensed. Run from the repository root: node scripts/validate.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import yaml from "js-yaml";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { AUTHOR, FILE_PREFIX, LICENCE_URL, SITE_NAME, noticeAscii, notice, yearFor } from "./stamp-metadata.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const haikusDir = path.join(root, "haikus");
const schema = JSON.parse(fs.readFileSync(path.join(root, "schema/haiku.schema.json"), "utf8"));

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const errors = [];
const warnings = [];
const seenIds = new Map();

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return walk(p);
    return d.isFile() && p.endsWith(".md") ? [p] : [];
  });
}

function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

// Returns true if a JPEG contains an EXIF (APP1 "Exif"), XMP (APP1 "http://ns.adobe.com/xap/") or IPTC (APP13) segment.
// Every JPEG must carry the copyright stamp written by scripts/stamp-metadata.mjs and
// nothing else: an EXIF block holding only description, artist and copyright, plus the
// XMP rights packet. Anything more (GPS, timestamps, IPTC) is an error.
const EXIF_ALLOWED = new Set([0x010e, 0x013b, 0x8298]);

function readIfd0Ascii(tiff) {
  const le = tiff.toString("latin1", 0, 2) === "II";
  const u16 = (o) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  const ifd = u32(4);
  const n = u16(ifd);
  const tags = new Map();
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
    let value = null;
    if (type === 2) {
      const off = count <= 4 ? e + 8 : u32(e + 8);
      value = tiff.toString("latin1", off, off + count).replace(/\0+$/, "");
    }
    tags.set(tag, value);
  }
  return tags;
}

function checkJpegStamp(buf, file) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return "is not a JPEG";
  const year = yearFor(file);
  let exif = null, xmp = null;
  let i = 2;
  while (i + 4 <= buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const len = buf.readUInt16BE(i + 2);
    const payload = buf.subarray(i + 4, i + 2 + len);
    if (marker === 0xe1) {
      const head = payload.toString("latin1", 0, 29);
      if (head.startsWith("Exif\0\0")) exif = payload.subarray(6);
      else if (head.startsWith("http://ns.adobe.com/xap/")) xmp = payload.subarray(29).toString("utf8");
    }
    if (marker === 0xed) return "carries IPTC/Photoshop metadata";
    if (marker === 0xfe) return "carries a comment segment";
    i += 2 + len;
  }
  if (!exif || !xmp) return `is missing the copyright stamp; run node scripts/stamp-metadata.mjs ${file}`;
  const tags = readIfd0Ascii(exif);
  for (const tag of tags.keys()) if (!EXIF_ALLOWED.has(tag)) return `carries EXIF tag 0x${tag.toString(16)} beyond the copyright stamp; re-run node scripts/stamp-metadata.mjs ${file}`;
  if (tags.get(0x8298) !== noticeAscii(year)) return `EXIF copyright is "${tags.get(0x8298)}", expected "${noticeAscii(year)}"`;
  if (tags.get(0x013b) !== AUTHOR) return `EXIF artist is "${tags.get(0x013b)}", expected "${AUTHOR}"`;
  if (!xmp.includes(notice(year))) return `XMP rights do not say "${notice(year)}"`;
  if (!xmp.includes(LICENCE_URL)) return `XMP web statement does not link to ${LICENCE_URL}`;
  if (!xmp.includes(`<photoshop:Credit>${SITE_NAME}</photoshop:Credit>`)) return `XMP credit is not "${SITE_NAME}"`;
  return null;
}

// The poem body, split the way the site reads it: stanzas are separated by one or
// more blank lines; a haibun puts its prose first, then a line holding only "---",
// then the verse. gray-matter only treats the leading block as front matter, so a
// later "---" is plain content.
function parseBody(content) {
  const lines = content.split(/\r?\n/).map((l) => l.trimEnd());
  const cut = lines.findIndex((l) => l.trim() === "---");
  const prose = cut === -1 ? [] : lines.slice(0, cut);
  const verse = cut === -1 ? lines : lines.slice(cut + 1);
  const stanzas = [];
  let current = [];
  for (const l of verse) {
    if (l.trim() === "") {
      if (current.length) stanzas.push(current);
      current = [];
    } else current.push(l);
  }
  if (current.length) stanzas.push(current);
  const proseParagraphs = prose.join("\n").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return { prose: proseParagraphs, stanzas, lines: stanzas.flat() };
}

// What each form's body should look like. Line counts are warnings (a poem may
// break the pattern on purpose); a missing structure is an error.
function checkBody(form, content, rel) {
  const { prose, stanzas, lines } = parseBody(content);
  const warn = (msg) => warnings.push(`${rel}: ${msg}`);
  const fail = (msg) => errors.push(`${rel}: ${msg}`);
  if (lines.length === 0) return fail("poem body is empty");
  if (form !== "haibun" && prose.length) return fail(`a ${form} has no prose section; remove the "---" line or set form: haibun`);
  switch (form) {
    case "haiku-traditional":
    case "senryu":
      if (lines.length !== 3) warn(`${form} has ${lines.length} lines, not 3`);
      break;
    case "haiku-modern":
      if (lines.length !== 3) warn(`haiku-modern has ${lines.length} lines, not 3`);
      break;
    case "tanka":
      if (lines.length !== 5) warn(`tanka has ${lines.length} lines, not 5`);
      break;
    case "haibun":
      if (prose.length === 0) return fail('haibun needs prose, then a line holding only "---", then the verse');
      if (lines.length !== 3) warn(`haibun verse has ${lines.length} lines, not 3`);
      break;
    case "renku":
      if (stanzas.length < 2) return fail("renku needs at least two stanzas separated by a blank line");
      stanzas.forEach((s, i) => {
        const want = i % 2 === 0 ? 3 : 2;
        if (s.length !== want) warn(`renku stanza ${i + 1} has ${s.length} lines, not ${want}`);
      });
      break;
    default:
      break; // the schema has already reported an unknown form
  }
}

// Every image under media/, referenced or not, is named with the site prefix and stamped.
function walkMedia(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return walkMedia(p);
    return d.isFile() && /\.(jpe?g|png|webp)$/i.test(d.name) ? [p] : [];
  });
}

const files = walk(haikusDir);
if (files.length === 0) warnings.push("No poems found under haikus/.");

for (const file of files) {
  const rel = path.relative(root, file);
  const fail = (msg) => errors.push(`${rel}: ${msg}`);

  // Path rule: haikus/YYYY/YYYY-MM-DD-slug.md with matching year.
  const m = /^haikus\/(\d{4})\/(\d{4})-(\d{2})-(\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/.exec(rel.split(path.sep).join("/"));
  if (!m) {
    fail("file must be named haikus/YYYY/YYYY-MM-DD-slug.md with a lower-case slug");
  } else if (m[1] !== m[2]) {
    fail(`folder year ${m[1]} does not match file date year ${m[2]}`);
  }

  let parsed;
  try {
    // JSON_SCHEMA keeps dates as strings; the default YAML schema would turn
    // 2026-02-30 into a Date and silently roll it over to 2 March.
    parsed = matter(fs.readFileSync(file, "utf8"), {
      engines: { yaml: (src) => yaml.load(src, { schema: yaml.JSON_SCHEMA }) },
    });
  } catch (e) {
    fail(`front matter could not be parsed: ${e.message}`);
    continue;
  }
  const fm = parsed.data;

  if (!validate(fm)) {
    for (const e of validate.errors) {
      const where = e.instancePath ? e.instancePath.replace(/^\//, "").replace(/\//g, ".") : "front matter";
      const extra = e.params?.allowedValues ? ` (allowed: ${e.params.allowedValues.join(", ")})` : e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : "";
      fail(`${where} ${e.message}${extra}`);
    }
  }

  for (const k of ["date", "created", "updated"]) {
    if (typeof fm[k] === "string" && !isRealDate(fm[k])) fail(`${k} "${fm[k]}" is not a real calendar date`);
  }
  if (typeof fm.created === "string" && typeof fm.updated === "string" && fm.updated < fm.created) {
    fail(`updated ${fm.updated} is before created ${fm.created}`);
  }

  if (typeof fm.id === "string") {
    if (seenIds.has(fm.id)) fail(`duplicate id ${fm.id}, also used by ${seenIds.get(fm.id)}`);
    seenIds.set(fm.id, rel);
  }

  checkBody(fm.form ?? "haiku-traditional", parsed.content, rel);

  for (const img of fm.media?.images ?? []) {
    if (typeof img.src !== "string") continue;
    const p = path.join(root, img.src);
    if (!fs.existsSync(p)) {
      fail(`image ${img.src} does not exist`);
      continue;
    }
  }
}

const mediaFiles = walkMedia(path.join(root, "media"));
const seenNames = new Map();
for (const p of mediaFiles) {
  const rel = path.relative(root, p);
  const name = path.basename(p);
  if (!name.startsWith(FILE_PREFIX)) errors.push(`${rel}: image file names start with ${FILE_PREFIX}`);
  const stem = name.replace(/\.[^.]+$/, "");
  if (seenNames.has(stem)) errors.push(`${rel}: image name ${stem} is also used by ${seenNames.get(stem)}; names must be unique across media/`);
  seenNames.set(stem, rel);
  const buf = fs.readFileSync(p);
  if (/\.jpe?g$/i.test(name)) {
    const problem = checkJpegStamp(buf, rel);
    if (problem) errors.push(`${rel}: ${problem}`);
  } else {
    warnings.push(`${rel}: not a JPEG, so it carries no copyright stamp; convert it with sips and stamp it`);
  }
  if (buf.length > 1_500_000) warnings.push(`${rel}: ${(buf.length / 1e6).toFixed(1)} MB; resize to 1600px`);
}

for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`\n${errors.length} error(s) in ${files.length} file(s).`);
  process.exit(1);
}
console.log(`OK: ${files.length} poem(s) valid, ${seenIds.size} unique id(s), ${mediaFiles.length} image(s) named and stamped.`);
