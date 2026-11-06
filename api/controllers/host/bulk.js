/**
 * host/bulk
 *
 * Apply group membership and image changes to many hosts at once, driven by
 * host-list selection: the host list's "Edit groups" modal (1.6 "Group
 * Membership") and "Set Image", and the group page's Host Associations tab.
 * Accepts { id:[...], addGroups, removeGroups, image } where `image` is an
 * image name or id ('' clears it).
 *
 * Permissions follow the pinned 1.6 split (HostManagement.php ~6855-6880): a
 * membership change is a group edit, so addGroups and removeGroups need
 * group.update, and an added name with no Group needs group.create as well
 * (api/helpers/group/authorize.js). Each host's whole groups array is
 * written, so a stored name whose Group is gone needs group.create too. An
 * image change needs host.update.
 */
module.exports = {
  friendlyName: 'Bulk host update',
  description: 'Apply group membership and image changes to many selected hosts.',
  fn: async function () {
    let req = this.req;
    let res = this.res;
    let p = req.allParams();
    let permissions = req.user && req.user.permissions;

    // The names, split and trimmed as a host's own groups are.
    let addGroups = sails.models.host.normalizeGroups(p.addGroups);
    let removeGroups = sails.models.host.normalizeGroups(p.removeGroups);
    let membership = addGroups.length > 0 || removeGroups.length > 0;
    let hostFields = Object.prototype.hasOwnProperty.call(p, 'image');
    // The 1.6 failure titles (HostManagement.php ~6874-6977), uneven plurals
    // included.
    let failTitle = (addGroups.length || !removeGroups.length) ? 'Add Hosts to Group Fail' : 'Remove Hosts from Groups Fail';

    // A call that changes no membership keeps its host.update check.
    if ((hostFields || !membership) && !_.get(permissions, 'stock.host.update')) {
      return res.forbidden();
    }
    if (membership) {
      let denied = await sails.helpers.group.authorize.with({permissions, names: addGroups});
      if (denied) {
        return res.status(403).json({message: denied, title: failTitle});
      }
    }

    // Resolve a requested image by name or id; '' (or null) clears it.
    let imageSet; // undefined => leave image alone
    if (hostFields) {
      if (p.image === '' || p.image === null) {
        imageSet = null;
      } else {
        let img = await sails.models.image.findOne({ name: p.image });
        if (!img) { try { img = await sails.models.image.findOne({ id: p.image }); } catch (unused) { /* not an id */ } }
        if (!img) { return res.badRequest({ error: `Image not found: ${p.image}` }); }
        imageSet = img.id;
      }
    }

    // Target set: an explicit selection (id list), or -- when `all` is set --
    // every host matching the current list search (name/description/groups
    // substring; empty search = every host). Filtering in JS keeps the match
    // semantics predictable and avoids adapter-specific array/contains quirks.
    let hosts;
    let updated = 0;
    if (p.all) {
      let s = String(p.search || '').trim().toLowerCase();
      let everyHost = await sails.models.host.find();
      hosts = s
        ? everyHost.filter((h) => [h.name, h.description, Array.isArray(h.groups) ? h.groups.join(' ') : '']
          .join(' ').toLowerCase().indexOf(s) !== -1)
        : everyHost;
    } else {
      let ids = Array.isArray(p.id) ? p.id : (p.id ? [p.id] : []);
      if (!ids.length) { return res.badRequest({ error: 'No hosts selected.' }); }
      hosts = await sails.models.host.find({ id: ids });
    }
    // removeGroups drops a value only when its name matches, without case. An
    // unknown name matches nothing, so it changes nothing.
    let removeKeys = removeGroups.map((g) => g.toLowerCase());
    let writes = [];
    let written = [];
    for (let h of hosts) {
      let set = {};
      if (membership) {
        let stored = Array.isArray(h.groups) ? h.groups : [];
        let groups = stored.filter((g) => removeKeys.indexOf(String(g).toLowerCase()) === -1);
        for (let g of addGroups) {
          if (!groups.some((x) => String(x).toLowerCase() === g.toLowerCase())) { groups.push(g); }
        }
        // A host whose groups do not change is not written.
        if (!_.isEqual(groups, stored)) {
          set.groups = groups;
          written = written.concat(groups);
        }
      }
      if (imageSet !== undefined) { set.image = imageSet; }
      if (Object.keys(set).length) { writes.push({id: h.id, set}); }
    }
    // Host.beforeUpdate maps each written name to its Group, and creates a
    // Group for a name that has none -- a stored name too, when its Group is
    // gone (a failed group/remove). So every written name passes the
    // group.create check before the first write, not only addGroups.
    if (written.length) {
      let names = _.uniq(written, (n) => String(n).toLowerCase());
      let denied = await sails.helpers.group.authorize.with({permissions, names});
      if (denied) {
        return res.status(403).json({message: denied, title: failTitle});
      }
    }
    for (let w of writes) {
      await sails.models.host.updateOne({ id: w.id }).set(w.set);
      updated++;
    }

    // The 1.6 success toast (HostManagement.php ~6950-6970). A removal counts
    // the named Groups that exist.
    if (!membership) {
      return res.json({ updated });
    }
    let groupCount = addGroups.length;
    if (!addGroups.length) {
      groupCount = 0;
      for (let name of removeGroups) {
        if (await sails.helpers.group.find.with({name})) { groupCount++; }
      }
    }
    return res.json({
      updated,
      msg: addGroups.length
        ? `Added ${hosts.length} host(s) to ${groupCount} group(s).`
        : `Removed ${hosts.length} host(s) from ${groupCount} group(s).`,
      title: addGroups.length ? 'Add Hosts to Groups Success' : 'Remove Hosts from Groups Success'
    });
  }
};
