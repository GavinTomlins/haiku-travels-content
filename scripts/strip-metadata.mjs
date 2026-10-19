#!/usr/bin/env node
// Removes EXIF, XMP, IPTC/Photoshop and comment segments from JPEG files in
// place, keeping JFIF, ICC colour profiles and the image data untouched.
// MIT licensed. Usage: node scripts/strip-metadata.mjs media/2026/photo.jpg [...]
import fs from "node:fs";

const DROP = new Set([0xe1, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xeb, 0xec, 0xed, 0xef, 0xfe]);
// Kept: E0 (JFIF), E2 (ICC profile), EE (Adobe colour transform), and all non-APP segments.

function strip(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error("not a JPEG");
  const parts = [buf.subarray(0, 2)];
  let i = 2;
  let removed = 0;
  while (i + 4 <= buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1];
    if (marker === 0xda) break; // start of scan: the rest is image data
    const len = buf.readUInt16BE(i + 2);
    const seg = buf.subarray(i, i + 2 + len);
    if (DROP.has(marker)) removed++;
    else parts.push(seg);
    i += 2 + len;
  }
  parts.push(buf.subarray(i));
  return { out: Buffer.concat(parts), removed };
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node scripts/strip-metadata.mjs <file.jpg> [...]");
  process.exit(2);
}
let failed = false;
for (const f of files) {
  try {
    const { out, removed } = strip(fs.readFileSync(f));
    fs.writeFileSync(f, out);
    console.log(`${f}: removed ${removed} metadata segment(s)`);
  } catch (e) {
    failed = true;
    console.error(`${f}: ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
