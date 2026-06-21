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
 *     has no snapins association).
 * See docs/adr/0001 + docs/plugins.md.
 */
const path = require('path');

const LINK = 'plugin_snapin_host';
function linkColl() {
  return sails.getDatastore(sails.models.host.datastore).manager.collection(LINK);
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

  menuItems: [
    {
      text: 'Snapin',
      plural: 'Snapins',
      link: '/snapins',
      icon: 'fa-archive',
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
        header: 'Snapin List',
        theads: ['Name', 'File', 'Enabled'],
        model: 'snapin',
        title: 'All Snapins',
        partialname: path.join(__dirname, 'list.partial.js')
      });
    },
    // Create page (form -> POST /snapins/create -> general/save).
    'GET /snapins/create': async function (req, res) {
      if (!can(req, 'create')) { return res.forbidden(); }
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
        model: 'snapin', method: 'post', action: '/snapins/create',
        id: 'snapin-create', classes: ['snapin-create-form'],
        formItems,
        formButtons: {
          Cancel: { classes: ['btn-warning', 'float-start'], type: 'submit' },
          Create: { classes: ['btn-success', 'float-end'], type: 'submit' }
        }
      });
      return res.view('pages/create', {
        model: 'snapin', header: 'Create New Snapin', title: 'Create New Snapin',
        form, partialname: false
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
        let snapins = await sails.models.snapin.find().sort('name ASC'),
          checked = [];
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
      // The host form always carries the Snapins tab, so "no snapins[] submitted"
      // means "none selected" -> clear this host's links.
      save: async function (hostId, params) {
        let ids = params && params.snapins
          ? (Array.isArray(params.snapins) ? params.snapins : [params.snapins]).map(String).filter(Boolean)
          : [];
        let coll = linkColl();
        await coll.deleteMany({ host: String(hostId) });
        if (ids.length) {
          await coll.insertMany(ids.map((s) => ({ host: String(hostId), snapin: s })));
        }
      },
      destroy: async function (hostId) {
        await linkColl().deleteMany({ host: String(hostId) });
      }
    }
  }
};
