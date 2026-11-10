/**
 * Resolve the host that a first fog-agent enroll request belongs to, as FOG 1.6
 * does (contract 3.2, the non-feature path; Enrollment::_resolve). Only a
 * non-pending host can resolve, so a pending host that an earlier request
 * created is never found again, and a second key with the same MAC gets its
 * own pending host (1.6 does the same).
 *
 * SMBIOS first, unless the Setting FOG_HOST_IDENTIFY_SMBIOS is `off`. Each
 * non-pending host scores +1 for a guid that equals system_uuid, +1 for a serial
 * that equals system_serial, and +1 for an asset that equals chassis_asset only
 * when one of those two matched. The unique top score of 1 or more wins. A tie
 * is no match. Then the MACs: one host wins, or the one with the most matching
 * MACs, and a tie is no match. fog-node keeps no board serial, so board_serial
 * is not matched.
 *
 * Inputs:
 *   identity  the request `identity` object
 *   macs      the valid MACs, 12 lower-case hex digits each
 *
 * Output {hostId, reason, smbios}.
 *   hostId  the winning host's id, or '' when none resolved
 *   reason  unknown-host, identity-conflict, rebind or known-host-no-agent
 *   smbios  {guid, serial, asset}: the usable canonical values, for a new pending host
 *
 * Usage: let {hostId, reason, smbios} = await sails.helpers.agent.resolveHost.with({identity, macs})
 */
// The values that mean "the firmware did not say". Copied from PLACEHOLDERS in
// /var/www/html/fog-1.6/src/Base/SmbiosIdentity.php (compared without case).
const PLACEHOLDERS = [
  '00020003-0004-0005-0006-000700080009',
  '12345678-1234-5678-90AB-CDDEEFAABBCC',
  '123456789',
  'Not Present',
  'Not Settable',
  'Not Specified',
  'Not Applicable',
  'Not Available',
  'None',
  'N/A',
  'Unknown',
  'Default string',
  'To be filled by O.E.M.',
  'To Be Set By OEM',
  'Enter Serial',
  'Type2 - Board Serial Number',
  'Base Board Serial Number',
  'System Serial Number',
  'Chassis Serial Number',
  'Chassis Asset Tag',
  'Asset Tag',
  'No Asset Tag',
  'No Asset Information',
  '.PCIE2'
].map((p) => p.toLowerCase());

// SmbiosIdentity::canonicalize: trim, and collapse whitespace runs to one space.
const canonicalize = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

// SmbiosIdentity::isUsable. The value is canonical. Returns '' for a value to drop.
const usable = (value) => {
  if (value === '' || PLACEHOLDERS.includes(value.toLowerCase())) { return ''; }
  // One repeated character, once "-", "/" and spaces are removed.
  const bare = value.replace(/[-/ ]/g, '');
  return (bare === '' || /^(.)\1*$/i.test(bare)) ? '' : value;
};

// The id of the unique entry with the top score (1 or more), or '' on a tie or
// when there is none. `scores` maps a host id to its score.
const winner = (scores) => {
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ranked.length || ranked[0][1] < 1) { return ''; }
  if (ranked.length > 1 && ranked[1][1] === ranked[0][1]) { return ''; }
  return ranked[0][0];
};

module.exports = {
  friendlyName: 'Resolve an agent host',
  description: 'Find the host that a first enroll request belongs to, by SMBIOS and then by MAC.',
  inputs: {
    identity: {type: 'ref', required: true, description: 'The request identity object.'},
    macs: {type: 'ref', required: true, description: 'The valid MACs, 12 lower-case hex digits each.'}
  },
  exits: {
    success: {outputType: 'ref', description: '{hostId, reason, smbios}'}
  },
  fn: async function ({identity, macs}) {
    const smbios = {
      guid: usable(canonicalize(identity.system_uuid)),
      serial: usable(canonicalize(identity.system_serial)),
      asset: usable(canonicalize(identity.chassis_asset))
    };
    const coll = sails.getDatastore(sails.models.host.datastore).manager.collection(sails.models.host.tableName);
    const docs = {};

    // The Host model stores guid, serial and asset in lower case.
    let smbiosId = '';
    const setting = await sails.models.setting.findOne({name: 'FOG_HOST_IDENTIFY_SMBIOS'});
    const smbiosOff = setting && String(setting.value).trim().toLowerCase() === 'off';
    if (!smbiosOff && (smbios.guid || smbios.serial)) {
      const guid = smbios.guid.toLowerCase();
      const serial = smbios.serial.toLowerCase();
      const asset = smbios.asset.toLowerCase();
      const or = [];
      if (guid) { or.push({guid}); }
      if (serial) { or.push({serial}); }
      const scores = {};
      for (const doc of await coll.find({pending: {$ne: true}, $or: or}).toArray()) {
        const id = String(doc._id);
        docs[id] = doc;
        const firmware = (guid && doc.guid === guid ? 1 : 0) + (serial && doc.serial === serial ? 1 : 0);
        scores[id] = firmware + (firmware && asset && doc.asset === asset ? 1 : 0);
      }
      smbiosId = winner(scores);
    }

    let macId = '';
    if (macs.length) {
      const scores = {};
      for (const doc of await coll.find({pending: {$ne: true}, macs: {$in: macs}}).toArray()) {
        const id = String(doc._id);
        docs[id] = doc;
        scores[id] = (doc.macs || []).filter((m) => macs.includes(m)).length;
      }
      macId = winner(scores);
    }

    const hostId = smbiosId || macId;
    if (!hostId) { return {hostId: '', reason: 'unknown-host', smbios}; }
    // Firmware and MACs name different hosts: keep the firmware's host.
    if (smbiosId && macId && smbiosId !== macId) { return {hostId, reason: 'identity-conflict', smbios}; }
    return {hostId, reason: docs[hostId].agentFingerprint ? 'rebind' : 'known-host-no-agent', smbios};
  }
};
