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
function jpegHasMetadata(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return false;
  let i = 2;
  while (i + 4 <= buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1];
    if (marker === 0xda || marker === 0xd9) break; // start of scan or end of image
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xe1) {
      const head = buf.subarray(i + 4, i + 4 + 29).toString("latin1");
      if (head.startsWith("Exif") || head.startsWith("http://ns.adobe.com/xap/")) return true;
    }
    if (marker === 0xed) return true; // APP13, Photoshop/IPTC
    i += 2 + len;
  }
  return false;
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

  const lines = parsed.content.split(/\r?\n/).map((l) => l.trimEnd()).filter((l, i, a) => !(l === "" && (i === 0 || i === a.length - 1)));
  const nonEmpty = lines.filter((l) => l.trim() !== "");
  if (nonEmpty.length === 0) fail("poem body is empty");
  else if (nonEmpty.length !== 3) warnings.push(`${rel}: poem has ${nonEmpty.length} lines, not 3`);

  for (const img of fm.media?.images ?? []) {
    if (typeof img.src !== "string") continue;
    const p = path.join(root, img.src);
    if (!fs.existsSync(p)) {
      fail(`image ${img.src} does not exist`);
      continue;
    }
    const buf = fs.readFileSync(p);
    if (/\.jpe?g$/i.test(img.src) && jpegHasMetadata(buf)) {
      fail(`image ${img.src} still carries EXIF/XMP/IPTC metadata; strip it before committing`);
    }
    if (buf.length > 1_500_000) warnings.push(`${rel}: image ${img.src} is ${(buf.length / 1e6).toFixed(1)} MB; resize to 1600px`);
  }
}

for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`\n${errors.length} error(s) in ${files.length} file(s).`);
  process.exit(1);
}
console.log(`OK: ${files.length} poem(s) valid, ${seenIds.size} unique id(s).`);
