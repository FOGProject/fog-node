/**
 * printer plugin
 *
 * Printers as a PLUGIN, not core. Like the snapin plugin it contributes a
 * `printer` catalog model (+ permissions, menu, list/create pages), and a host
 * "Printers" tab via extends.host. Host<->printer assignment, the per-host
 * printer level, and the default printer all live in this plugin's own
 * collections -- the core Host has no printer fields. See docs/adr/0001.
 */
const path = require('path');

const LINK = 'plugin_printer_host',     // { host, printer }
  CFG = 'plugin_printer_hostcfg';       // { host, level, defaultPrinter }
function linkColl() { return sails.getDatastore(sails.models.host.datastore).manager.collection(LINK); }
function cfgColl() { return sails.getDatastore(sails.models.host.datastore).manager.collection(CFG); }
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

  menuItems: [
    {
      text: 'Printer',
      plural: 'Printers',
      link: '/printers',
      icon: 'fa-print',
      subLinks: [
        { link: '/printers/create', text: 'Create New Printer' }
      ]
    }
  ],

  routes: {
    'GET /printers': async function (req, res) {
      if (!can(req, 'read')) { return res.forbidden(); }
      return res.view('pages/list', {
        header: 'Printer List',
        theads: ['Name', 'IP Address', 'Model'],
        model: 'printer',
        title: 'All Printers',
        partialname: path.join(__dirname, 'list.partial.js')
      });
    },
    'GET /printers/create': async function (req, res) {
      if (!can(req, 'create')) { return res.forbidden(); }
      let formItems = {
        name: { textarea: false, text: 'Name', type: 'text', id: 'prname', classes: [], placeholder: 'FrontDesk' },
        description: { textarea: true, text: 'Description', type: 'text', id: 'prdescription', classes: [] },
        printerModel: { textarea: false, text: 'Model', type: 'text', id: 'prmodel', classes: [], placeholder: 'HP LaserJet' },
        port: { textarea: false, text: 'Port', type: 'text', id: 'prport', classes: [], placeholder: 'LPT1' },
        ip: { textarea: false, text: 'IP Address', type: 'text', id: 'prip', classes: [], placeholder: '10.0.0.20' }
      };
      let form = await sails.helpers.formGenerator.with({
        model: 'printer', method: 'post', action: '/printers/create',
        id: 'printer-create', classes: ['printer-create-form'],
        formItems,
        formButtons: {
          Cancel: { classes: ['btn-warning', 'float-start'], type: 'submit' },
          Create: { classes: ['btn-success', 'float-end'], type: 'submit' }
        }
      });
      return res.view('pages/create', {
        model: 'printer', header: 'Create New Printer', title: 'Create New Printer',
        form, partialname: false
      });
    },
    'POST /printers/create': { action: 'general/save' },
    'GET /printers/edit/:id': { action: 'pages/edit' },
    'POST /printers/edit/:id': { action: 'general/save' }
  },

  extends: {
    host: {
      form: async function (record) {
        let printers = await sails.models.printer.find().sort('name ASC'),
          checked = [], level = '0', def = '';
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
      save: async function (hostId, params) {
        let ids = params && params.printers
          ? (Array.isArray(params.printers) ? params.printers : [params.printers]).map(String).filter(Boolean)
          : [];
        let lc = linkColl();
        await lc.deleteMany({ host: String(hostId) });
        if (ids.length) {
          await lc.insertMany(ids.map((p) => ({ host: String(hostId), printer: p })));
        }
        await cfgColl().updateOne(
          { host: String(hostId) },
          { $set: {
            host: String(hostId),
            level: params && params.printerLevel ? String(params.printerLevel) : '0',
            defaultPrinter: (params && params.defaultPrinter) ? String(params.defaultPrinter) : ''
          } },
          { upsert: true }
        );
      },
      destroy: async function (hostId) {
        await linkColl().deleteMany({ host: String(hostId) });
        await cfgColl().deleteMany({ host: String(hostId) });
      }
    }
  }
};
