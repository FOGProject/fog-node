/**
 * printer plugin
 *
 * Printers as a PLUGIN, not core. Like the snapin plugin it contributes a
 * `printer` catalog model (+ permissions, menu, list/create pages), and a host
 * "Printers" tab via extends.host. Host<->printer assignment, the per-host
 * printer level, and the default printer all live in this plugin's own
 * collections -- the core Host has no printer fields. See docs/adr/0001.
 * The group "Printer Associations" tab and the group grants come via
 * extends.group (FOG 1.6 ADR 0038), kept in `plugin_printer_group`.
 */
const path = require('path');

const LINK = 'plugin_printer_host';     // { host, printer }
const CFG = 'plugin_printer_hostcfg';       // { host, level, defaultPrinter }
const GROUP = 'plugin_printer_group';   // { group, printer, isDefault }
function linkColl() { return sails.getDatastore(sails.models.host.datastore).manager.collection(LINK); }
function cfgColl() { return sails.getDatastore(sails.models.host.datastore).manager.collection(CFG); }
function groupColl() { return sails.getDatastore(sails.models.host.datastore).manager.collection(GROUP); }
// The ids of a checktable value: a string, an array, or nothing. The '' entry
// that makes the tab always send the key is dropped, as are repeats.
function idList(given) {
  let list = given === null || given === undefined ? [] : (Array.isArray(given) ? given : [given]);
  return _.uniq(list.map(String).filter(Boolean));
}
// The ids in `given` that name a catalog printer, in the given order.
async function catalogIds(given) {
  if (!given.length) { return []; }
  let found = (await sails.models.printer.find({ id: { in: given } }).select(['id'])).map((p) => String(p.id));
  return given.filter((id) => found.indexOf(id) !== -1);
}
function can(req, action) {
  return !!(req.user && req.user.permissions && req.user.permissions.stock &&
    req.user.permissions.stock.printer && req.user.permissions.stock.printer[action]);
}
const PT = 'Printers';
const LEVELS = [
  { value: '0', label: 'No Printer Management' },
  { value: '1', label: 'Add These Printers' },
  { value: '2', label: 'Add These + Remove Others' }
];

module.exports = {
  name: 'printer',

  models: {
    printer: {
      identity: 'printer',
      globalId: 'Printer',
      attributes: {
        name: { type: 'string', required: true, unique: true },
        description: { type: 'string' },
        port: { type: 'string' },
        file: { type: 'string' },
        // named printerModel, not model: the generic CRUD routes are /:model.
        printerModel: { type: 'string' },
        config: { type: 'string' },
        configFile: { type: 'string' },
        ip: { type: 'string' }
      }
    }
  },

  permissions: {
    printer: { create: false, read: false, update: false, destroy: false }
  },

  search: [
    { model: 'printer', label: 'Printers', fields: ['name', 'description', 'printerModel', 'ip'] }
  ],

  // Printers is a core page in FOG 1.6, so `order` puts it inline in MAIN
  // NAVIGATION, at its 1.6 slot (after Storage Nodes), not under PLUGIN OPTIONS.
  menuItems: [
    {
      order: 90,
      text: 'Printers',
      link: '/printers',
      icon: 'fas fa-print',
      subLinks: [
        { link: '/printers/create', text: 'Create New Printer' }
      ]
    }
  ],

  routes: {
    'GET /printers': async function (req, res) {
      if (!can(req, 'read')) { return res.forbidden(); }
      return res.view('pages/list', {
        theads: ['Name', 'IP Address', 'Model'],
        model: 'printer',
        // The 1.6 title, the nouns, the table settings and the edit link base.
        ...await sails.helpers.listLocals.with({identity: 'printer', base: '/printers'}),
        partialname: path.join(__dirname, 'list.partial.js')
      });
    },
    'GET /printers/create': async function (req, res) {
      if (!can(req, 'create')) { return res.forbidden(); }
      // ?modal=1 (fogCreateModal): the form alone, with no layout.
      let modal = req.query.modal === '1';
      let formItems = {
        name: { textarea: false, text: 'Name', type: 'text', id: 'prname', classes: [], placeholder: 'FrontDesk' },
        description: { textarea: true, text: 'Description', type: 'text', id: 'prdescription', classes: [] },
        printerModel: { textarea: false, text: 'Model', type: 'text', id: 'prmodel', classes: [], placeholder: 'HP LaserJet' },
        port: { textarea: false, text: 'Port', type: 'text', id: 'prport', classes: [], placeholder: 'LPT1' },
        ip: { textarea: false, text: 'IP Address', type: 'text', id: 'prip', classes: [], placeholder: '10.0.0.20' }
      };
      let form = await sails.helpers.formGenerator.with({
        model: 'printer', mode: modal ? 'create-modal' : 'create', method: 'post', action: '/printers/create',
        id: 'printer-create', classes: ['printer-create-form'],
        formItems
      });
      // The FOG 1.6 content header and tab title.
      let names = sails.helpers.pageTitle.with({identity: 'printer'});
      return res.view('pages/create', {
        model: 'printer',
        section: names.section, page: `Create New ${names.singular}`,
        form, partialname: false,
        // layout true is the default layout; false renders the form alone.
        modal, layout: !modal
      });
    },
    'POST /printers/create': { action: 'general/save' },
    'GET /printers/edit/:id': { action: 'pages/edit' },
    'POST /printers/edit/:id': { action: 'general/save' }
  },

  extends: {
    host: {
      form: async function (record) {
        let printers = await sails.models.printer.find().sort('name ASC');
        let checked = [];
        let level = '0';
        let def = '';
        if (record && record.id) {
          let links = await linkColl().find({ host: String(record.id) }).toArray();
          checked = links.map((l) => String(l.printer));
          let cfg = await cfgColl().findOne({ host: String(record.id) });
          if (cfg) { level = String(cfg.level || '0'); def = cfg.defaultPrinter ? String(cfg.defaultPrinter) : ''; }
        }
        return {
          printerLevel: {
            text: 'Printer Level', classes: [], textarea: false, type: 'select', tab: PT,
            options: LEVELS.map((l) => ({ value: l.value, label: l.label, selected: l.value === level }))
          },
          defaultPrinter: {
            text: 'Default Printer', classes: [], textarea: false, type: 'select', tab: PT,
            options: [{ value: '', label: '(none)', selected: !def }].concat(
              printers.map((p) => ({ value: p.id, label: p.name, selected: String(p.id) === def }))
            )
          },
          printers: {
            text: 'Printers', classes: [], textarea: false, type: 'checktable', tab: PT,
            options: printers.map((p) => ({ value: p.id, label: p.name, checked: checked.indexOf(String(p.id)) !== -1 }))
          }
        };
      },
      // Each host edit tab is its own form, so a save from another tab carries
      // none of this tab's keys: then the links and the config stay as they
      // are. The Printers checktable always sends `printers` (a hidden ''
      // entry), so a present key with no id means "none selected".
      save: async function (hostId, params) {
        let has = (key) => !!params && Object.prototype.hasOwnProperty.call(params, key);
        if (has('printers')) {
          let given = params.printers === null || params.printers === undefined ? [] : params.printers;
          let ids = (Array.isArray(given) ? given : [given]).map(String).filter(Boolean);
          let lc = linkColl();
          await lc.deleteMany({ host: String(hostId) });
          if (ids.length) {
            await lc.insertMany(ids.map((p) => ({ host: String(hostId), printer: p })));
          }
        }
        // Set only the config keys the form sent.
        let set = {};
        if (has('printerLevel')) { set.level = params.printerLevel ? String(params.printerLevel) : '0'; }
        if (has('defaultPrinter')) { set.defaultPrinter = params.defaultPrinter ? String(params.defaultPrinter) : ''; }
        if (Object.keys(set).length) {
          set.host = String(hostId);
          await cfgColl().updateOne({ host: String(hostId) }, { $set: set }, { upsert: true });
        }
      },
      destroy: async function (hostId) {
        await linkColl().deleteMany({ host: String(hostId) });
        await cfgColl().deleteMany({ host: String(hostId) });
      }
    },

    // Group grants, as FOG 1.6 (GroupManagement.php groupPrinters and
    // groupPrinterPost ~474-545, Resolver.php resolvePrinters ~223-315). A
    // printer granted to a group reaches each member, now and later; a host
    // that leaves loses it; a printer given to the host directly is never
    // affected. A group does not grant a printer level: the level stays per
    // host, in plugin_printer_hostcfg, as in 1.6.
    group: {
      form: async function (group) {
        let printers = await sails.models.printer.find().sort('name ASC');
        let rows = await groupColl().find({ group: String(group.id) }).toArray();
        let checked = rows.map((r) => String(r.printer));
        let def = rows.find((r) => r.isDefault);
        def = def ? String(def.printer) : '';
        return {
          groupPrinters: {
            text: 'Group Printer Assignment', classes: [], textarea: false, type: 'checktable',
            tab: 'Printer Associations',
            help: 'A printer granted here reaches every host in this group, including hosts added later. ' +
              'Removing a host from the group takes the printer away again. A printer the host was given ' +
              'directly is unaffected either way.',
            options: printers.map((p) => ({ value: p.id, label: p.name, checked: checked.indexOf(String(p.id)) !== -1 }))
          },
          // The form generator puts "(none)" first in every select.
          groupDefaultPrinter: {
            text: 'Group Default Printer', id: 'groupdefaultprinter', classes: [], textarea: false, type: 'select',
            tab: 'Printer Associations',
            help: 'The default printer for hosts in this group. A host that has its own default keeps it.',
            options: printers.map((p) => ({ value: p.id, label: p.name, selected: String(p.id) === def }))
          }
        };
      },
      // Each group edit tab is its own form, so a save from another tab
      // carries none of these keys: then the grants stay as they are. The
      // checktable always sends `groupPrinters` (a hidden '' entry), so a
      // present key with no id means "none selected". Only catalog printers
      // are granted.
      save: async function (groupId, params) {
        let has = (key) => !!params && Object.prototype.hasOwnProperty.call(params, key);
        let gid = String(groupId);
        let coll = groupColl();
        // A printer that stays keeps its row, so it keeps `isDefault`, and
        // the grant order (by _id) stays the order the printers were granted
        // in, as 1.6 keeps gpaID.
        if (has('groupPrinters')) {
          let ids = await catalogIds(idList(params.groupPrinters));
          await coll.deleteMany({ group: gid, printer: { $nin: ids } });
          if (ids.length) {
            await coll.bulkWrite(ids.map((p) => ({
              updateOne: {
                filter: { group: gid, printer: p },
                update: { $setOnInsert: { group: gid, printer: p, isDefault: false } },
                upsert: true
              }
            })));
          }
        }
        // The default: on that printer only. A default the group does not
        // grant yet is granted first, as 1.6 groupPrinterPost does (~536-541).
        // '' clears it. An id that names no catalog printer (one deleted
        // after the page loaded) leaves the default as it is.
        if (has('groupDefaultPrinter')) {
          let wanted = idList(params.groupDefaultPrinter)[0] || '';
          let def = wanted ? (await catalogIds([wanted]))[0] : '';
          if (def !== undefined) {
            await coll.updateMany({ group: gid, printer: { $ne: def } }, { $set: { isDefault: false } });
          }
          if (def) {
            await coll.updateOne({ group: gid, printer: def }, { $set: { isDefault: true } }, { upsert: true });
          }
        }
      },
      destroy: async function (groupId) {
        await groupColl().deleteMany({ group: String(groupId) });
      },
      // The Grants column labels (1.6 Route.php ~8841-8842): one aggregate for
      // the page. A group with no grant gets no label.
      grants: async function (groupIds) {
        let ids = groupIds.map(String);
        let counts = await groupColl().aggregate([
          { $match: { group: { $in: ids } } },
          { $group: { _id: '$group', n: { $sum: 1 } } }
        ]).toArray();
        let out = {};
        counts.forEach((c) => { out[c._id] = [c.n === 1 ? '1 printer' : `${c.n} printers`]; });
        return out;
      },
      // The effective printers of each host, by the 1.6 resolvePrinters rule:
      // the host's direct links by _id, then each group in membership order,
      // its grants by _id, each printer once, in its first place. The default
      // is the host's own default when it has one; else the default of the
      // first group, in membership order, that names one; else null.
      // `inherited` holds the ids that come only from groups. Three reads for
      // any number of hosts.
      resolve: async function (hostIds, membership) {
        let hids = hostIds.map(String);
        // Each read comes back in _id order, and groupBy keeps it per key.
        let direct = _.groupBy(await linkColl().find({ host: { $in: hids } }).sort({ _id: 1 }).toArray(), 'host');
        let cfgs = _.indexBy(await cfgColl().find({ host: { $in: hids } }).toArray(), 'host');
        let gids = _.uniq(_.flatten(hids.map((h) => (membership[h] || []).map((g) => String(g.id)))));
        let granted = _.groupBy(gids.length ? await groupColl().find({ group: { $in: gids } }).sort({ _id: 1 }).toArray() : [], 'group');
        let out = {};
        hids.forEach((h) => {
          let printers = _.uniq((direct[h] || []).map((r) => String(r.printer)));
          let inherited = [];
          let def = cfgs[h] && cfgs[h].defaultPrinter ? String(cfgs[h].defaultPrinter) : null;
          (membership[h] || []).forEach((g) => {
            let rows = granted[String(g.id)] || [];
            rows.forEach((r) => {
              let p = String(r.printer);
              if (printers.indexOf(p) === -1) { printers.push(p); inherited.push(p); }
            });
            let groupDefault = rows.find((r) => r.isDefault);
            if (def === null && groupDefault) { def = String(groupDefault.printer); }
          });
          out[h] = { printers, default: def, inherited };
        });
        return out;
      }
    }
  }
};
