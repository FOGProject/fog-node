/**
 * seed-demo.js -- optional sample/test data for trying out the UI at scale.
 *
 * Seeds a large, realistic-looking dataset so the host list (and friends) show
 * "true" infinite scroll: many Hosts plus Images, StorageGroups + StorageNodes,
 * and PxeMenus. Host MACs are drawn from REAL IEEE OUI prefixes (curated to
 * recognizable brands) so the MAC-vendor column lights up with real names.
 *
 * NOT for production baseline data -- it's gated behind an explicit opt-in in
 * the installer (default no). Non-destructive + re-runnable: existing named
 * records (images/groups/pxe) are skipped, and host numbering continues past
 * any hosts already seeded (createdBy === 'seed'). Undo with
 * `Host.destroy({createdBy:'seed'})` (and likewise for the other collections).
 *
 * Two ways to run:
 *   - Standalone CLI:  SEED_HOSTS=5000 node tools/setup/seed-demo.js
 *   - Programmatic:    const { seedDemoData } = require('./seed-demo');
 *                      await seedDemoData({ numHosts, log });   // Sails already loaded
 */
'use strict';

const path = require('path');
const config = require('../lib/config');
// Load lazily-tolerant: a missing snapshot must not crash the installer for
// admins who decline demo data -- seedDemoData() surfaces a clear error if used.
let OUI_DB = {};
try {
  OUI_DB = require(path.join(config.appPath, 'api', 'services', 'mac-oui.json'));
} catch (e) {
  OUI_DB = {};
}

// ---------- tiny random helpers ----------
const rint = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rint(a.length)];
const chance = (p) => Math.random() < p;
const pad = (n, w) => String(n).padStart(w, '0');
function sampleK(arr, k) {
  const c = arr.slice(), out = [];
  while (k-- > 0 && c.length) { out.push(c.splice(rint(c.length), 1)[0]); }
  return out;
}
function pastDateTime(maxDaysAgo) {
  const d = new Date(Date.now() - rint(maxDaysAgo) * 86400000 - rint(86400000));
  const p = (n) => pad(n, 2);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ---------- curated real-OUI pool (every entry resolves to a known vendor) ----------
const BRANDS = ['Dell', 'Intel', 'Hewlett', 'Lenovo', 'ASUSTek', 'Apple', 'Cisco',
  'Realtek', 'Micro-Star', 'Microsoft', 'Samsung', 'VMware', 'Raspberry', 'Google',
  'NETGEAR', 'TP-LINK', 'Hon Hai', 'GIGA-BYTE', 'AzureWave', 'Liteon', 'Wistron',
  'Quanta', 'Acer', 'TOSHIBA', 'Sony', 'FUJITSU'];
function buildOuiPool() {
  const blc = BRANDS.map((b) => b.toLowerCase());
  const pool = [];
  for (const oui in OUI_DB) {
    const v = OUI_DB[oui].toLowerCase();
    for (let i = 0; i < blc.length; i++) { if (v.indexOf(blc[i]) !== -1) { pool.push(oui); break; } }
  }
  return pool;
}

// ---------- static pools ----------
const DEPTS = ['eng', 'sales', 'hr', 'it', 'lab', 'finance', 'mktg', 'ops', 'support',
  'design', 'qa', 'exec', 'warehouse', 'reception', 'training', 'helpdesk', 'research'];
const TYPES = ['wks', 'lt', 'pc', 'desktop', 'vm', 'kiosk', 'thin', 'mini'];
const MODELS = ['Dell OptiPlex 7090', 'HP EliteDesk 800 G6', 'Lenovo ThinkCentre M720',
  'Dell Latitude 5430', 'HP ProBook 450 G9', 'Lenovo ThinkPad T14', 'Apple iMac 24"',
  'ASUS ExpertCenter D7', 'Acer Veriton X', 'Custom Build', 'Microsoft Surface Pro 9',
  'Dell Precision 3660', 'Intel NUC 13 Pro'];
const TAGS = ['windows', 'linux', 'macos', 'laptop', 'desktop', 'vm', 'imaged',
  'pending-image', 'classroom', 'office', 'remote', 'loaner', 'staff', 'student',
  'priority', 'legacy', 'win11', 'win10', 'ssd', 'uefi', 'bios', 'docked', '1gbe', 'wifi'];

const IMAGE_SPECS = [
  ['win11-pro-23h2', 'Windows 11 Pro 23H2', 9], ['win11-ent-23h2', 'Windows 11 Enterprise 23H2', 9],
  ['win11-edu-22h2', 'Windows 11 Education 22H2', 9], ['win10-ent-22h2', 'Windows 10 Enterprise 22H2', 9],
  ['win10-pro-22h2', 'Windows 10 Pro 22H2', 9], ['win10-edu-21h2', 'Windows 10 Education 21H2', 9],
  ['win10-ltsc-2021', 'Windows 10 LTSC 2021', 9], ['winsrv-2022-std', 'Windows Server 2022 Standard', 9],
  ['winsrv-2019-std', 'Windows Server 2019 Standard', 9], ['ubuntu-2204-lab', 'Ubuntu 22.04 LTS Lab', 50],
  ['ubuntu-2404-dev', 'Ubuntu 24.04 LTS Dev', 50], ['fedora-40-ws', 'Fedora 40 Workstation', 50],
  ['debian-12-srv', 'Debian 12 Server', 50], ['rocky-9-srv', 'Rocky Linux 9 Server', 50],
  ['mint-21-edu', 'Linux Mint 21 Education', 50], ['popos-2204', 'Pop!_OS 22.04', 50],
  ['macos-sonoma-14', 'macOS Sonoma 14', 4], ['macos-ventura-13', 'macOS Ventura 13', 4],
  ['chromeos-flex', 'ChromeOS Flex', 50], ['win11-dev-vm', 'Windows 11 Dev VM', 9],
  ['kiosk-win10', 'Kiosk Windows 10', 9], ['thin-linux', 'Thin Client Linux', 50],
  ['lab-dualboot', 'Lab Dual Boot Win/Linux', 9], ['cad-workstation', 'CAD Workstation Win11', 9],
  ['classroom-base', 'Classroom Base Image', 9], ['library-public', 'Library Public Terminal', 9],
  ['nursing-sim', 'Nursing Simulation Lab', 9], ['esports-rig', 'Esports Rig Win11', 9],
  ['exam-lockdown', 'Exam Lockdown Image', 9], ['recovery-winpe', 'Recovery WinPE', 9]
];
const PXE_SPECS = [
  ['boot-local', 'Boot from local disk'], ['register-host', 'Full host registration'],
  ['quick-image', 'Quick image deploy'], ['quick-register', 'Quick registration'],
  ['memtest', 'Memtest86+'], ['clonezilla', 'Clonezilla Live'], ['gparted', 'GParted partition editor'],
  ['windows-pe', 'Windows PE environment'], ['rescue-shell', 'Rescue shell'],
  ['sysinfo', 'Hardware compatibility / sysinfo'], ['deploy-image', 'Deploy assigned image'],
  ['capture-image', 'Capture image from host']];
const SG_SPECS = [
  ['default', 'Default storage group'], ['west-datacenter', 'West DC replication group'],
  ['east-datacenter', 'East DC replication group'], ['branch-offices', 'Branch office nodes']];

// find-or-create by unique `name`, returning all rows for the given specs.
async function ensureByName(Model, specs, mapFn, label, log) {
  const names = specs.map((s) => s.name);
  const existing = await Model.find({ where: { name: { in: names } }, select: ['name'] });
  const have = new Set(existing.map((e) => e.name));
  const toCreate = specs.filter((s) => !have.has(s.name)).map(mapFn);
  let created = [];
  if (toCreate.length) { created = await Model.createEach(toCreate).fetch(); }
  const all = await Model.find({ where: { name: { in: names } } });
  log(`  ${label}: +${created.length} new (${all.length} total)`);
  return all;
}

/**
 * Seed the demo dataset. Assumes Sails is already loaded (uses the global
 * models). Returns a summary object.
 * @param {{numHosts?:number, batch?:number, log?:Function}} [opts]
 */
async function seedDemoData(opts) {
  opts = opts || {};
  const numHosts = opts.numHosts || 5000;
  const batchSize = opts.batch || 1000;
  const log = opts.log || function () {};

  const OUI_POOL = buildOuiPool();
  if (!OUI_POOL.length) { throw new Error('OUI pool empty -- is api/services/mac-oui.json present?'); }
  log(`OUI pool: ${OUI_POOL.length} real prefixes across ${BRANDS.length} brands`);
  const randomMac = () => {
    let suf = '';
    for (let i = 0; i < 6; i++) { suf += '0123456789abcdef'[rint(16)]; }
    return pick(OUI_POOL) + suf; // bare 12-hex lowercase (Host.beforeCreate keeps this form)
  };

  log('Seeding images...');
  const images = await ensureByName(Image,
    IMAGE_SPECS.map(([name, desc, os]) => ({ name, description: desc, os })),
    (s) => ({
      name: s.name, description: s.description, os: s.os, enabled: true,
      imageType: 1, imagePartitionType: 1, format: 5, compress: 11,
      path: s.name, createdBy: 'seed', lastCaptureDate: chance(0.8) ? pastDateTime(400) : ''
    }), 'images', log);
  const imageIds = images.map((i) => i.id);

  log('Seeding storage groups + nodes...');
  const groups = await ensureByName(StorageGroup,
    SG_SPECS.map(([name, desc]) => ({ name, description: desc })),
    (s) => ({ name: s.name, description: s.description }), 'storage groups', log);
  const nodeSpecs = [];
  groups.forEach((g, gi) => {
    nodeSpecs.push({
      name: `${g.name}-master`, storagegroup: g.id, isMaster: true, isEnabled: true,
      ip: `10.0.${gi + 1}.10`, path: '/images/', ftppath: '/images/',
      snapinpath: '/opt/fog/snapins/', maxClients: 10 + rint(40), bitrate: '100000'
    });
    if (gi > 0) {
      nodeSpecs.push({
        name: `${g.name}-replica`, storagegroup: g.id, isMaster: false, isEnabled: true,
        ip: `10.0.${gi + 1}.11`, path: '/images/', ftppath: '/images/',
        snapinpath: '/opt/fog/snapins/', maxClients: 10 + rint(20), bitrate: '100000'
      });
    }
  });
  const existingNodes = await StorageNode.find({ where: { name: { in: nodeSpecs.map((n) => n.name) } }, select: ['name'] });
  const haveNodes = new Set(existingNodes.map((n) => n.name));
  const newNodes = nodeSpecs.filter((n) => !haveNodes.has(n.name));
  if (newNodes.length) { await StorageNode.createEach(newNodes); }
  log(`  storage nodes: +${newNodes.length} new`);

  log('Seeding PXE menus...');
  await ensureByName(PxeMenu,
    PXE_SPECS.map(([name, desc]) => ({ name, description: desc })),
    (s) => ({ name: s.name, description: s.description, params: '', default: s.name === 'boot-local' }), 'pxe menus', log);

  // ---------- hosts ----------
  const already = await Host.count({ createdBy: 'seed' });
  const start = already + 1;
  log(`Seeding ${numHosts} hosts (continuing from #${start}; ${already} previously seeded)...`);
  let made = 0;
  for (let batchStart = 0; batchStart < numHosts; batchStart += batchSize) {
    const batch = [];
    const n = Math.min(batchSize, numHosts - batchStart);
    for (let j = 0; j < n; j++) {
      const idx = start + batchStart + j;
      const dept = pick(DEPTS), type = pick(TYPES);
      const macs = [randomMac()];
      if (chance(0.18)) { macs.push(randomMac()); } // some dual-NIC hosts
      batch.push({
        name: `${dept}-${type}-${pad(idx, 5)}`,
        macs,
        tags: sampleK(TAGS, rint(5)),
        description: `${pick(MODELS)} — ${dept.toUpperCase()}`,
        ip: `10.${rint(254) + 1}.${rint(256)}.${rint(254) + 1}`,
        pingstatus: chance(0.65) ? '1' : '0',
        deployed: chance(0.7) ? pastDateTime(365) : '',
        image: chance(0.8) ? pick(imageIds) : null,
        createdBy: 'seed'
      });
    }
    await Host.createEach(batch);
    made += n;
    log(`  hosts: ${made}/${numHosts}`);
  }

  const totalHosts = await Host.count();
  return { seededHosts: made, totalHosts, images: imageIds.length, storageGroups: groups.length };
}

module.exports = { seedDemoData, BRANDS };

// ---------- standalone CLI ----------
if (require.main === module) {
  const sails = require('sails');
  let cfg = config.getMergedSettings();
  cfg.log = { level: 'error' };
  if (!cfg.schema) { cfg.schema = 1; }
  cfg.appPath = config.appPath;
  cfg.models = { migrate: 'safe' };  // never auto-migrate (Mongo is schemaless)
  cfg.hooks = { grunt: false };      // no asset build needed just to seed
  const numHosts = parseInt(process.env.SEED_HOSTS || '5000', 10);

  sails.load(cfg, async (err) => {
    if (err) { console.error(err); process.exit(1); }
    const t0 = Date.now();
    try {
      const res = await seedDemoData({ numHosts, log: console.log });
      console.log(`\nDONE in ${((Date.now() - t0) / 1000).toFixed(1)}s. Total hosts now: ${res.totalHosts}`);
      process.exit(0);
    } catch (e) {
      console.error('Seed failed:', e && e.message ? e.message : e);
      process.exit(1);
    }
  });
}
