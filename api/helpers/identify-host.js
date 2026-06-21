/**
 * identifyHost helper (issue #198)
 *
 * Identify a host by the scored *makeup of the physical machine* rather than by
 * MAC alone. Given a fingerprint presented at boot/check-in (the SMBIOS values
 * iPXE exposes natively), score every candidate host across the signals and
 * return the best confident match -- so a NIC swap (MAC changes) or a board swap
 * (UUID changes) still resolves to the right host.
 *
 * Returns the matched host's native mongo doc (with `_id`, `name`, ...) and the
 * score, or null when nothing clears the threshold.
 */

// Per-signal weights. UUID is the strongest single identifier; a bare MAC match
// alone still clears the threshold (preserves classic FOG behaviour).
const WEIGHTS = { guid: 100, serial: 50, asset: 30, mac: 40 };
const THRESHOLD = 40;

function norm(v) {
  return (typeof v === 'string') ? v.trim().toLowerCase() : '';
}
function normMac(v) {
  let hex = String(v == null ? '' : v).replace(/[\s.:-]/g, '').toLowerCase();
  return /^[0-9a-f]{12}$/.test(hex) ? hex : '';
}

module.exports = {
  friendlyName: 'Identify host',
  description: 'Find the best-matching host for a presented hardware fingerprint (issue #198).',
  inputs: {
    fingerprint: {
      type: {},
      required: true,
      description: 'SMBIOS-ish signals: { guid|uuid, serial, asset, mac|macs }.'
    }
  },
  exits: {
    success: { outputFriendlyName: 'Match', description: 'null, or { host, score, signals }.' }
  },
  fn: async function (inputs) {
    let fp = inputs.fingerprint || {},
      guid = norm(fp.guid || fp.uuid),
      serial = norm(fp.serial),
      asset = norm(fp.asset),
      macsIn = fp.macs || fp.mac || [],
      macs = (Array.isArray(macsIn) ? macsIn : [macsIn]).map(normMac).filter(Boolean);

    // Build a query that fetches only the hosts sharing at least one signal.
    let or = [];
    if (guid) { or.push({ guid }); }
    if (serial) { or.push({ serial }); }
    if (asset) { or.push({ asset }); }
    if (macs.length) { or.push({ macs: { $in: macs } }); }
    if (!or.length) { return null; }

    let coll = sails.getDatastore(sails.models.host.datastore).manager.collection(sails.models.host.tableName),
      candidates = await coll.find({ $or: or }).toArray();

    let best = null;
    for (let c of candidates) {
      let score = 0, signals = [];
      if (guid && norm(c.guid) === guid) { score += WEIGHTS.guid; signals.push('guid'); }
      if (serial && norm(c.serial) === serial) { score += WEIGHTS.serial; signals.push('serial'); }
      if (asset && norm(c.asset) === asset) { score += WEIGHTS.asset; signals.push('asset'); }
      let chostMacs = Array.isArray(c.macs) ? c.macs : [];
      if (macs.some((m) => chostMacs.indexOf(m) !== -1)) { score += WEIGHTS.mac; signals.push('mac'); }
      if (!best || score > best.score) { best = { host: c, score, signals }; }
    }

    return (best && best.score >= THRESHOLD) ? best : null;
  }
};
