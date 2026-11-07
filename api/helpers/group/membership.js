/**
 * The Groups of each host, in the FOG 1.6 resolution order. The plugins
 * resolve their group grants from it (sails.plugins.groupResolve,
 * api/hooks/plugins/index.js). Core stores no grant; this is all it knows
 * about them.
 *
 * - A host's Groups are the Group records named in its `groups`, matched
 *   without case. A name with no Group is skipped.
 * - The order is `order` ascending, then `name` without case, then `id`
 *   (1.6 Resolver.php ~58-62, _orderedGroupIDs ~657-693). The id tiebreak
 *   keeps the order deterministic: a rename must not reorder what a host gets.
 * - Two queries for any number of hosts: one for the hosts, one for their
 *   Groups. A query per host is what 1.6 GH-707 fixed (Resolver.php ~38-44).
 *
 * Every host id passed in is a key, with [] when the host has no Group or
 * does not exist.
 *
 * Usage: await sails.helpers.group.membership.with({hostIds: [h1.id, h2.id]})
 *   -> {[hostId]: [{id, name, description, order, createdAt, updatedAt}, ...]}
 */
// Compares names as strength 2 (Group.nameCollation) does: letters and
// accents count, case does not. It both sorts and matches names here.
const caseless = new Intl.Collator('en', {sensitivity: 'accent'});

// The one resolution order: `order`, then name without case, then id. A Group
// stored before `order` existed counts as 0, the attribute default.
function compare(a, b) {
  return ((Number(a.order) || 0) - (Number(b.order) || 0)) ||
    caseless.compare(a.name, b.name) ||
    (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0));
}

module.exports = {
  friendlyName: 'Group membership',
  description: 'The Groups of each host, in the 1.6 resolution order.',
  inputs: {
    hostIds: {type: 'ref', required: true, description: 'An array of host ids.'}
  },
  exits: {
    success: {outputType: 'ref', description: '{[hostId]: [<Group records>]}, one key for each id passed in.'}
  },
  fn: async function ({hostIds}) {
    let ids = _.uniq(hostIds.map(String));
    let out = {};
    ids.forEach((id) => { out[id] = []; });
    if (!ids.length) {
      return out;
    }
    let hosts = await sails.models.host.find({id: {in: ids}}).select(['groups']);
    let names = _.uniq(_.flatten(hosts.map((h) => (Array.isArray(h.groups) ? h.groups : []))))
      .filter((n) => typeof n === 'string');
    if (!names.length) {
      return out;
    }
    // One read of every named Group. The collation makes $in match without
    // case, as the unique name index does (api/helpers/group/ensure-index.js).
    let Group = sails.models.group;
    let collection = sails.getDatastore(Group.datastore).manager.collection(Group.tableName);
    let docs = await collection.find({name: {$in: names}}, {collation: Group.nameCollation}).toArray();
    // The record shape the ORM returns: `id`, not the native `_id`.
    let groups = docs.map((doc) => Object.assign(_.omit(doc, '_id'), {id: String(doc._id)})).sort(compare);
    hosts.forEach((host) => {
      let mine = (Array.isArray(host.groups) ? host.groups : []).filter((n) => typeof n === 'string');
      out[String(host.id)] = groups.filter((g) => mine.some((n) => caseless.compare(n, g.name) === 0));
    });
    return out;
  }
};
