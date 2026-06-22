/**
 * MacVendor -- offline MAC address vendor (OUI) lookup.
 *
 * Resolves the IEEE Organizationally Unique Identifier (first 3 octets of a MAC)
 * to the registered vendor name, using the bundled mac-oui.json snapshot. No
 * network calls: FOG servers are routinely deployed on isolated networks, and a
 * MAC should never have to leave the box to learn its vendor. Refresh the
 * snapshot with `node scripts/build-oui.js`.
 *
 * Synchronous by design so it can be called inline from model customToJSON,
 * helpers, and view controllers. Exposed as a Sails service (global `MacVendor`)
 * and via direct require('../services/MacVendor').
 */
let DB = {};
try {
  DB = require('./mac-oui.json');
} catch (e) {
  // Snapshot missing (not yet generated) -- degrade to "no vendor known"
  // rather than crash. Run scripts/build-oui.js to populate it.
  sails && sails.log ? sails.log.warn('MacVendor: mac-oui.json not found; vendor labels disabled. Run scripts/build-oui.js') : null;
  DB = {};
}

module.exports = {
  /**
   * Look up the vendor for a single MAC address.
   * Accepts any separator style (aa:bb.., aa-bb.., aabb..) or partial input.
   * @param {string} mac
   * @returns {string|null} vendor name, or null if unknown / too short
   */
  lookup: function (mac) {
    if (!mac) { return null; }
    const hex = String(mac).replace(/[^0-9a-fA-F]/g, '').toLowerCase();
    if (hex.length < 6) { return null; }
    const oui = hex.slice(0, 6);
    // The all-zero OUI is the IEEE-assigned Xerox prefix, but in practice it
    // means a null/loopback/unconfigured MAC -- don't mislabel those as Xerox.
    if (oui === '000000') { return null; }
    return DB[oui] || null;
  },

  /**
   * Resolve a list of MACs to a parallel array of vendor names ('' when
   * unknown), index-aligned with the input. Handy for customToJSON.
   * @param {string[]} macs
   * @returns {string[]}
   */
  lookupAll: function (macs) {
    if (!Array.isArray(macs)) { return []; }
    return macs.map((m) => module.exports.lookup(m) || '');
  }
};
