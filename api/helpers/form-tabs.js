// Field -> tab mapping for the Host form (mirrors FOG 1.x's grouped tabs).
const HOST_MAP = {
  name: 'General', description: 'General', ip: 'General', building: 'General',
  deployed: 'General', createdBy: 'General', image: 'General', groups: 'General',
  guid: 'Identity', serial: 'Identity', asset: 'Identity',
  macs: 'MAC Addresses',
  kernel: 'Boot', kernelArgs: 'Boot', kernelDevice: 'Boot', init: 'Boot',
  biosexit: 'Boot', efiexit: 'Boot',
  // (Active Directory fields now come from the `ad` plugin, which sets their tab.)
  // (printers + snapins now come from their plugins, which set their own tabs.)
  productKey: 'Service', pending: 'Service', pubKey: 'Service', secToken: 'Service',
  secTime: 'Service', pingstatus: 'Service', enforce: 'Service', token: 'Service',
  tokenlock: 'Service'
};
const HOST_ORDER = ['General', 'MAC Addresses', 'Identity', 'Boot', 'Active Directory', 'Printers', 'Snapins', 'Service'];
// The 1.6 group tabs (GroupManagement.php ~1790-1812). The plugins set the
// tab of their own fields. The Host Associations pane has no fields: the
// form generator puts it right after General (api/controllers/pages/edit.js).
// fog-node has no tab dropdowns, so each is a top-level tab.
const GROUP_ORDER = ['General', 'Printer Associations', 'Snapin Associations'];

module.exports = {
  friendlyName: 'Form tabs',
  description: 'Assign each form item to a tab (in place) and return the tab order for the form generator.',
  inputs: {
    model: { type: 'string', required: true },
    formItems: { type: 'ref', required: true }
  },
  exits: {
    success: { outputFriendlyName: 'Tab order' }
  },
  fn: async function (inputs) {
    let model = inputs.model;
    let formItems = inputs.formItems || {};

    if (model === 'host') {
      Object.keys(formItems).forEach((k) => {
        // Preserve a tab a plugin already set (e.g. the AD plugin's fields);
        // otherwise use the core host map.
        formItems[k].tab = formItems[k].tab || HOST_MAP[k] || 'General';
      });
      return HOST_ORDER;
    }

    if (model === 'group') {
      Object.keys(formItems).forEach((k) => {
        formItems[k].tab = formItems[k].tab || 'General';
      });
      return GROUP_ORDER;
    }

    // Generic: scalar fields -> General; association fields already carry
    // tab: 'Associations' (set by the associationFields helper).
    Object.keys(formItems).forEach((k) => {
      if (!formItems[k].tab) { formItems[k].tab = 'General'; }
    });
    return ['General', 'Associations'];
  }
};
