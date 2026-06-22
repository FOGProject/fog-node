#!/usr/bin/env node
/**
 * build-oui.js -- (re)generate the bundled MAC vendor (OUI) database.
 *
 * Reads the IEEE MA-L registry (oui.csv) and writes a compact lookup table to
 *   api/services/mac-oui.json   ->  { "001122": "Vendor Name", ... }
 * keyed by the lower-case 6-hex OUI (first 3 octets). MacVendor.js loads this.
 *
 * Usage:
 *   node scripts/build-oui.js                 # fetch the live IEEE CSV
 *   node scripts/build-oui.js path/to/oui.csv # parse a local copy (air-gapped)
 *
 * FOG servers are often offline, so the JSON is committed to the repo; this
 * script is the refresh path -- download oui.csv on a connected box, copy it
 * over, and re-run with the file path.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const SOURCE_URL = 'https://standards-oui.ieee.org/oui/oui.csv';
const OUT_FILE = path.join(__dirname, '..', 'api', 'services', 'mac-oui.json');

// Minimal CSV record parser: handles RFC-4180 quoting ("" escapes a quote
// inside a quoted field) so org names containing commas/quotes stay intact.
function parseCsvLine(line) {
  const out = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(field);
      field = '';
    } else {
      field += c;
    }
  }
  out.push(field);
  return out;
}

// Build { oui6: org } from the CSV text. Columns: Registry,Assignment,Org,Address.
function build(csv) {
  const lines = csv.split(/\r?\n/);
  const db = {};
  let kept = 0;
  for (let i = 1; i < lines.length; i++) { // skip header row
    const line = lines[i];
    if (!line) { continue; }
    const cols = parseCsvLine(line);
    if (cols.length < 3) { continue; }
    const assignment = String(cols[1] || '').replace(/[^0-9a-fA-F]/g, '').toLowerCase();
    const org = String(cols[2] || '').trim();
    if (assignment.length !== 6 || !org) { continue; }
    db[assignment] = org;
    kept++;
  }
  return { db, kept };
}

function writeDb(db, kept) {
  // Sorted keys -> stable diffs when the DB is regenerated.
  const sorted = {};
  Object.keys(db).sort().forEach((k) => { sorted[k] = db[k]; });
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(sorted) + '\n');
  console.log(`Wrote ${kept} OUIs to ${OUT_FILE}`);
}

function fromUrl() {
  console.log(`Fetching ${SOURCE_URL} ...`);
  https.get(SOURCE_URL, (res) => {
    if (res.statusCode !== 200) {
      console.error(`Download failed: HTTP ${res.statusCode}`);
      res.resume();
      process.exit(1);
    }
    let csv = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => { csv += chunk; });
    res.on('end', () => {
      const { db, kept } = build(csv);
      if (!kept) { console.error('Parsed 0 OUIs -- aborting.'); process.exit(1); }
      writeDb(db, kept);
    });
  }).on('error', (err) => {
    console.error(`Download error: ${err.message}`);
    console.error('Offline? Download oui.csv on a connected machine and run:');
    console.error('  node scripts/build-oui.js path/to/oui.csv');
    process.exit(1);
  });
}

function fromFile(file) {
  console.log(`Reading ${file} ...`);
  const csv = fs.readFileSync(file, 'utf8');
  const { db, kept } = build(csv);
  if (!kept) { console.error('Parsed 0 OUIs -- aborting.'); process.exit(1); }
  writeDb(db, kept);
}

const arg = process.argv[2];
if (arg) { fromFile(arg); } else { fromUrl(); }
