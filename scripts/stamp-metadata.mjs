#!/usr/bin/env node
// Strips every metadata segment from a JPEG (phone photos carry location and
// time) and writes the copyright notice back as EXIF and XMP, so a copy of the
// image taken from the site still says who made it and where the licence is.
// MIT licensed. Usage: node scripts/stamp-metadata.mjs media/2026/HaikuTravels-name.jpg [...]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strip } from "./strip-metadata.mjs";

export const AUTHOR = "Gavin Tomlins";
export const SITE_NAME = "Haiku Travels";
export const SITE_URL = "https://haikutravels.xyz/";
export const LICENCE_URL = "https://haikutravels.xyz/about/#licence";
export const FILE_PREFIX = "HaikuTravels-";
export const USAGE_TERMS = `All rights reserved. Sketches and photographs are not covered by the poems' CC BY-NC-ND licence. Permissions: ${LICENCE_URL}`;

// "(c)" rather than © in the EXIF field, which is ASCII; the XMP copy uses ©.
export const noticeAscii = (year) => `(c) ${AUTHOR} ${year} - ${SITE_NAME}`;
export const notice = (year) => `© ${AUTHOR} ${year} - ${SITE_NAME}`;

// The year is the media folder's (media/2026/...), or the current year elsewhere (media/about/).
export function yearFor(file) {
  const m = /media[\\/](\d{4})[\\/]/.exec(file);
  return m ? m[1] : String(new Date().getFullYear());
}

function segment(marker, payload) {
  const len = payload.length + 2;
  return Buffer.concat([Buffer.from([0xff, marker, (len >> 8) & 0xff, len & 0xff]), payload]);
}

// A minimal big-endian TIFF with one IFD of ASCII tags. Tags must be in ascending order.
export function exifSegment(fields) {
  const entries = fields.map(([tag, s]) => [tag, Buffer.from(s + "\0", "latin1")]);
  const ifdSize = 2 + entries.length * 12 + 4;
  const ifd = Buffer.alloc(ifdSize);
  ifd.writeUInt16BE(entries.length, 0);
  const blobs = [];
  let dataOffset = 8 + ifdSize;
  entries.forEach(([tag, val], i) => {
    const o = 2 + i * 12;
    ifd.writeUInt16BE(tag, o);
    ifd.writeUInt16BE(2, o + 2); // ASCII
    ifd.writeUInt32BE(val.length, o + 4);
    if (val.length <= 4) val.copy(ifd, o + 8);
    else {
      ifd.writeUInt32BE(dataOffset, o + 8);
      blobs.push(val);
      dataOffset += val.length;
    }
  });
  const tiff = Buffer.concat([Buffer.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8]), ifd, ...blobs]);
  return segment(0xe1, Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]));
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function xmpPacket(year) {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/">
<dc:creator><rdf:Seq><rdf:li>${esc(AUTHOR)}</rdf:li></rdf:Seq></dc:creator>
<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${esc(notice(year))}</rdf:li></rdf:Alt></dc:rights>
<xmpRights:Marked>True</xmpRights:Marked>
<xmpRights:WebStatement>${esc(LICENCE_URL)}</xmpRights:WebStatement>
<xmpRights:UsageTerms><rdf:Alt><rdf:li xml:lang="x-default">${esc(USAGE_TERMS)}</rdf:li></rdf:Alt></xmpRights:UsageTerms>
<photoshop:Credit>${esc(SITE_NAME)}</photoshop:Credit>
<photoshop:Source>${esc(SITE_URL)}</photoshop:Source>
</rdf:Description></rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;
}

export function xmpSegment(year) {
  return segment(0xe1, Buffer.concat([Buffer.from("http://ns.adobe.com/xap/1.0/\0", "latin1"), Buffer.from(xmpPacket(year), "utf8")]));
}

export function stamp(buf, year) {
  const { out } = strip(buf);
  const stampSegs = [
    exifSegment([
      [0x010e, `${SITE_NAME} - ${SITE_URL}`], // ImageDescription
      [0x013b, AUTHOR], // Artist
      [0x8298, noticeAscii(year)], // Copyright
    ]),
    xmpSegment(year),
  ];
  // Insert after the JFIF segment when there is one, else straight after SOI.
  let at = 2;
  if (out[2] === 0xff && out[3] === 0xe0) at = 4 + out.readUInt16BE(4);
  return Buffer.concat([out.subarray(0, at), ...stampSegs, out.subarray(at)]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("usage: node scripts/stamp-metadata.mjs <media/.../HaikuTravels-name.jpg> [...]");
    process.exit(2);
  }
  let failed = false;
  for (const f of files) {
    try {
      if (!path.basename(f).startsWith(FILE_PREFIX)) throw new Error(`file name must start with ${FILE_PREFIX}`);
      if (!/\.jpe?g$/i.test(f)) throw new Error("only JPEG files can be stamped");
      const year = yearFor(f);
      fs.writeFileSync(f, stamp(fs.readFileSync(f), year));
      console.log(`${f}: stamped "${notice(year)}"`);
    } catch (e) {
      failed = true;
      console.error(`${f}: ${e.message}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
