/**
 * Create the pending host for an unknown fog-agent machine (contract 3.4;
 * Enrollment::_createPendingHost). The caller binds the enrollment row to it.
 *
 * The name is the request hostname when it passes the Host name rule and has at
 * most 15 characters (the NetBIOS limit), else `agent-<first 8 of the
 * fingerprint>`. While a host has that name (without case), the helper appends
 * -1, -2, ... and cuts the base so the name stays at most 15 characters.
 *
 * Inputs:
 *   hostname     the request hostname (any text)
 *   fingerprint  the key fingerprint
 *   macs         the valid MACs, 12 lower-case hex digits each (at least one)
 *   smbios       {guid, serial, asset}: the usable values from resolveHost
 *
 * Output: the new Host record.
 *
 * Usage: let host = await sails.helpers.agent.createPendingHost.with({hostname, fingerprint, macs, smbios})
 */
const MAX_NAME = 15;

module.exports = {
  friendlyName: 'Create a pending agent host',
  description: 'Create the pending Host for a machine that no host matched.',
  inputs: {
    hostname: {type: 'string', defaultsTo: ''},
    fingerprint: {type: 'string', required: true},
    macs: {type: 'ref', required: true},
    smbios: {type: 'ref', required: true}
  },
  exits: {
    success: {outputType: 'ref', description: 'The new Host record.'}
  },
  fn: async function ({hostname, fingerprint, macs, smbios}) {
    const Host = sails.models.host;
    const base = (hostname.length <= MAX_NAME && Host.nameRegex.test(hostname)) ?
      hostname : 'agent-' + fingerprint.slice(0, 8);
    // Host names are unique without case. Count with the case-insensitive collation.
    const coll = sails.getDatastore(Host.datastore).manager.collection(Host.tableName);
    const taken = async (name) => (await coll.countDocuments({name}, {collation: {locale: 'en', strength: 2}})) > 0;

    let name = base;
    for (let n = 1; await taken(name); n++) {
      const suffix = '-' + n;
      name = base.slice(0, MAX_NAME - suffix.length) + suffix;
    }
    return Host.create({
      name,
      macs,
      guid: smbios.guid,
      serial: smbios.serial,
      asset: smbios.asset,
      pending: true,
      description: 'Pending Registration created by FOG_AGENT'
    }).fetch();
  }
};
