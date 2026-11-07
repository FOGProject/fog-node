/**
 * snapin plugin
 *
 * Snapins (deployable software packages/scripts) as a PLUGIN, not core. It
 * contributes:
 *   - a `snapin` Waterline model (catalog) -> full generic CRUD for free
 *     (/api/v1/snapin, datatables, the generic edit page),
 *   - permissions for it,
 *   - a sidebar menu + list/create pages (the create/list pages render the core
 *     views; edit + save reuse the generic actions),
 *   - the host "Snapins" tab via extends.host, with the host<->snapin links kept
 *     in the plugin's own `plugin_snapin_host` collection (the core Host model
 *     has no snapins association),
 *   - the group "Snapin Associations" tab and the group grants via
 *     extends.group (FOG 1.6 ADR 0038), kept in `plugin_snapin_group`.
 * See docs/adr/0001 + docs/plugins.md.
 */
const path = require('path');

const LINK = 'plugin_snapin_host';
const GROUP = 'plugin_snapin_group';  // { group, snapin }
function linkColl() {
  return sails.getDatastore(sails.models.host.datastore).manager.collection(LINK);
}
function groupColl() {
  return sails.getDatastore(sails.models.host.datastore).manager.collection(GROUP);
}
// The ids of a checktable value: a string, an array, or nothing. The '' entry
// that makes the tab always send the key is dropped, as are repeats.
function idList(given) {
  let list = given === null || given === undefined ? [] : (Array.isArray(given) ? given : [given]);
  return _.uniq(list.map(String).filter(Boolean));
}
// The ids in `given` that name a catalog snapin, in the given order.
async function catalogIds(given) {
  if (!given.length) { return []; }
  let found = (await sails.models.snapin.find({ id: { in: given } }).select(['id'])).map((s) => String(s.id));
  return given.filter((id) => found.indexOf(id) !== -1);
}
function can(req, action) {
  return !!(req.user && req.user.permissions && req.user.permissions.stock &&
    req.user.permissions.stock.snapin && req.user.permissions.stock.snapin[action]);
}

module.exports = {
  name: 'snapin',

  models: {
    snapin: {
      identity: 'snapin',
      globalId: 'Snapin',
      attributes: {
        name: { type: 'string', required: true, unique: true },
        description: { type: 'string' },
        file: { type: 'string' },
        args: { type: 'string' },
        reboot: { type: 'boolean', defaultsTo: false },
        shutdown: { type: 'boolean', defaultsTo: false },
        runWith: { type: 'string' },
        runWithArgs: { type: 'string' },
        protected: { type: 'boolean', defaultsTo: false },
        isEnabled: { type: 'boolean', defaultsTo: true },
        toReplicate: { type: 'boolean', defaultsTo: true },
        hide: { type: 'boolean', defaultsTo: false },
        timeout: { type: 'number', isInteger: true, min: 0, defaultsTo: 0 },
        packtype: { type: 'number', isInteger: true, defaultsTo: 0 },
        hash: { type: 'string' },
        size: { type: 'string' },
        createdBy: { type: 'string' }
      }
    }
  },

  permissions: {
    snapin: { create: false, read: false, update: false, destroy: false }
  },

  search: [
    { model: 'snapin', label: 'Snapins', fields: ['name', 'description', 'file'] }
  ],

  // Snapins is a core page in FOG 1.6, so `order` puts it inline in MAIN
  // NAVIGATION, at its 1.6 slot (after Images), not under PLUGIN OPTIONS.
  menuItems: [
    {
      order: 50,
      text: 'Snapins',
      link: '/snapins',
      icon: 'fas fa-cube',
      subLinks: [
        { link: '/snapins/create', text: 'Create New Snapin' }
      ]
    }
  ],

  routes: {
    // List page (renders the core list view + this plugin's datatable partial).
    'GET /snapins': async function (req, res) {
      if (!can(req, 'read')) { return res.forbidden(); }
      return res.view('pages/list', {
        theads: ['Name', 'File', 'Enabled'],
        model: 'snapin',
        // The 1.6 title, the nouns, the table settings and the edit link base.
        ...await sails.helpers.listLocals.with({identity: 'snapin', base: '/snapins'}),
        partialname: path.join(__dirname, 'list.partial.js')
      });
    },
    // Create page (form -> POST /snapins/create -> general/save).
    'GET /snapins/create': async function (req, res) {
      if (!can(req, 'create')) { return res.forbidden(); }
      // ?modal=1 (fogCreateModal): the form alone, with no layout.
      let modal = req.query.modal === '1';
      let formItems = {
        name: { textarea: false, text: 'Name', type: 'text', id: 'spname', classes: [], placeholder: '7-Zip' },
        description: { textarea: true, text: 'Description', type: 'text', id: 'spdescription', classes: [] },
        file: { textarea: false, text: 'File', type: 'text', id: 'spfile', classes: [], placeholder: '7z.exe' },
        args: { textarea: false, text: 'Arguments', type: 'text', id: 'spargs', classes: [], placeholder: '/S' },
        runWith: { textarea: false, text: 'Run With', type: 'text', id: 'sprunwith', classes: [] },
        runWithArgs: { textarea: false, text: 'Run With Args', type: 'text', id: 'sprunwithargs', classes: [] },
        reboot: { textarea: false, text: 'Reboot After', type: 'checkbox', id: 'spreboot', classes: [], checked: false },
        isEnabled: { textarea: false, text: 'Enabled', type: 'checkbox', id: 'spenabled', classes: [], checked: true }
      };
      let form = await sails.helpers.formGenerator.with({
        model: 'snapin', mode: modal ? 'create-modal' : 'create', method: 'post', action: '/snapins/create',
        id: 'snapin-create', classes: ['snapin-create-form'],
        formItems
      });
      // The FOG 1.6 content header and tab title.
      let names = sails.helpers.pageTitle.with({identity: 'snapin'});
      return res.view('pages/create', {
        model: 'snapin',
        section: names.section, page: `Create New ${names.singular}`,
        form, partialname: false,
        // layout true is the default layout; false renders the form alone.
        modal, layout: !modal
      });
    },
    'POST /snapins/create': { action: 'general/save' },
    'GET /snapins/edit/:id': { action: 'pages/edit' },
    'POST /snapins/edit/:id': { action: 'general/save' }
  },

  // Host "Snapins" tab: a checktable of catalog snapins, with assignments stored
  // in this plugin's own link collection (never on the core Host).
  extends: {
    host: {
      form: async function (record) {
        let snapins = await sails.models.snapin.find().sort('name ASC');
        let checked = [];
        if (record && record.id) {
          let links = await linkColl().find({ host: String(record.id) }).toArray();
          checked = links.map((l) => String(l.snapin));
        }
        return {
          snapins: {
            text: 'Snapins', classes: [], textarea: false, type: 'checktable', tab: 'Snapins',
            options: snapins.map((s) => ({ value: s.id, label: s.name, checked: checked.indexOf(String(s.id)) !== -1 }))
          }
        };
      },
      // Each host edit tab is its own form, so a save from another tab carries
      // no `snapins` key: then the links stay as they are. The Snapins tab's
      // checktable always sends the key (a hidden '' entry), so a present key
      // with no id means "none selected" -> clear this host's links.
      save: async function (hostId, params) {
        if (!params || !Object.prototype.hasOwnProperty.call(params, 'snapins')) { return; }
        let given = params.snapins === null || params.snapins === undefined ? [] : params.snapins;
        let ids = (Array.isArray(given) ? given : [given]).map(String).filter(Boolean);
        let coll = linkColl();
        await coll.deleteMany({ host: String(hostId) });
        if (ids.length) {
          await coll.insertMany(ids.map((s) => ({ host: String(hostId), snapin: s })));
        }
      },
      destroy: async function (hostId) {
        await linkColl().deleteMany({ host: String(hostId) });
      }
    },

    // Group grants, as FOG 1.6 (GroupManagement.php groupSnapins ~546-605,
    // Resolver.php resolveSnapins ~97-160). A snapin granted to a group
    // reaches each member, now and later; a host that leaves loses it; a
    // snapin given to the host directly is never affected. Granting does not
    // run it.
    group: {
      form: async function (group) {
        let snapins = await sails.models.snapin.find().sort('name ASC');
        let rows = await groupColl().find({ group: String(group.id) }).toArray();
        let checked = rows.map((r) => String(r.snapin));
        return {
          groupSnapins: {
            text: 'Group Snapin Assignment', classes: [], textarea: false, type: 'checktable',
            tab: 'Snapin Associations',
            // The 1.6 help text without its Tasks clause: fog-node has no
            // Tasks tab to deploy from.
            help: 'A snapin granted here reaches every host in this group, including hosts added later. ' +
              'Granting a snapin does not run it.',
            options: snapins.map((s) => ({ value: s.id, label: s.name, checked: checked.indexOf(String(s.id)) !== -1 }))
          }
        };
      },
      // Each group edit tab is its own form, so a save from another tab
      // carries no `groupSnapins` key: then the grants stay as they are. The
      // checktable always sends the key (a hidden '' entry), so a present key
      // with no id means "none selected". A snapin that stays keeps its row,
      // so the grant order (by _id) stays the order the snapins were granted
      // in, as 1.6 keeps gsaID. Only catalog snapins are granted.
      save: async function (groupId, params) {
        if (!params || !Object.prototype.hasOwnProperty.call(params, 'groupSnapins')) { return; }
        let ids = await catalogIds(idList(params.groupSnapins));
        let gid = String(groupId);
        let coll = groupColl();
        await coll.deleteMany({ group: gid, snapin: { $nin: ids } });
        if (ids.length) {
          await coll.bulkWrite(ids.map((s) => ({
            updateOne: { filter: { group: gid, snapin: s }, update: { $setOnInsert: { group: gid, snapin: s } }, upsert: true }
          })));
        }
      },
      destroy: async function (groupId) {
        await groupColl().deleteMany({ group: String(groupId) });
      },
      // The Grants column labels (1.6 Route.php ~8838-8840): one aggregate for
      // the page. A group with no grant gets no label.
      grants: async function (groupIds) {
        let ids = groupIds.map(String);
        let counts = await groupColl().aggregate([
          { $match: { group: { $in: ids } } },
          { $group: { _id: '$group', n: { $sum: 1 } } }
        ]).toArray();
        let out = {};
        counts.forEach((c) => { out[c._id] = [c.n === 1 ? '1 snapin' : `${c.n} snapins`]; });
        return out;
      },
      // The effective snapins of each host, in the 1.6 resolveSnapins order:
      // the host's direct links by _id, then each group in membership order,
      // its grants by _id. A snapin met twice keeps its first place, so a
      // group never moves a snapin the host has directly. `inherited` holds
      // the ids that come only from groups. Two reads for any number of hosts.
      resolve: async function (hostIds, membership) {
        let hids = hostIds.map(String);
        // Both reads come back in _id order, and groupBy keeps it per key.
        let direct = _.groupBy(await linkColl().find({ host: { $in: hids } }).sort({ _id: 1 }).toArray(), 'host');
        let gids = _.uniq(_.flatten(hids.map((h) => (membership[h] || []).map((g) => String(g.id)))));
        let granted = _.groupBy(gids.length ? await groupColl().find({ group: { $in: gids } }).sort({ _id: 1 }).toArray() : [], 'group');
        let out = {};
        hids.forEach((h) => {
          let snapins = _.uniq((direct[h] || []).map((r) => String(r.snapin)));
          let inherited = [];
          (membership[h] || []).forEach((g) => {
            (granted[String(g.id)] || []).forEach((r) => {
              let s = String(r.snapin);
              if (snapins.indexOf(s) === -1) { snapins.push(s); inherited.push(s); }
            });
          });
          out[h] = { snapins, inherited };
        });
        return out;
      }
    }
  }
};
