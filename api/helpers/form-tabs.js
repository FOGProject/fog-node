// Field -> tab mapping for the Host form (mirrors FOG 1.x's grouped tabs).
const HOST_MAP = {
  name: 'General', description: 'General', ip: 'General', building: 'General',
  deployed: 'General', createdBy: 'General', guid: 'General', image: 'General',
  macs: 'MAC Addresses',
  kernel: 'Boot', kernelArgs: 'Boot', kernelDevice: 'Boot', init: 'Boot',
  biosexit: 'Boot', efiexit: 'Boot',
  useAD: 'Active Directory', ADDomain: 'Active Directory', ADOU: 'Active Directory',
  ADUser: 'Active Directory', ADPass: 'Active Directory', ADPassLegacy: 'Active Directory',
  printerLevel: 'Printers', defaultPrinter: 'Printers', printers: 'Printers',
  snapins: 'Snapins',
  productKey: 'Service', pending: 'Service', pubKey: 'Service', secToken: 'Service',
  secTime: 'Service', pingstatus: 'Service', enforce: 'Service', token: 'Service',
  tokenlock: 'Service'
};
const HOST_ORDER = ['General', 'MAC Addresses', 'Boot', 'Active Directory', 'Printers', 'Snapins', 'Service'];

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
    let model = inputs.model,
      formItems = inputs.formItems || {};

    if (model === 'host') {
      Object.keys(formItems).forEach((k) => {
        formItems[k].tab = HOST_MAP[k] || 'General';
      });
      return HOST_ORDER;
    }

    // Generic: scalar fields -> General; association fields already carry
    // tab: 'Associations' (set by the associationFields helper).
    Object.keys(formItems).forEach((k) => {
      if (!formItems[k].tab) { formItems[k].tab = 'General'; }
    });
    return ['General', 'Associations'];
  }
};
