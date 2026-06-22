module.exports = {
  friendlyName: 'View hwinfo',
  description: 'Display "Hwinfo" page.',
  exits: {
    success: {
      viewTemplatePath: 'pages/hwinfo'
    }
  },
  fn: async function () {
    let data = await sails.helpers.system.hwinfo(),
      partialname = false;
    // Label each NIC's MAC with its IEEE OUI vendor (offline lookup).
    let MacVendor = require('../../services/MacVendor');
    if (data && data.networkInfo && Array.isArray(data.networkInfo.ifaces)) {
      data.networkInfo.ifaces.forEach((iface) => {
        iface.vendor = MacVendor.lookup(iface.mac) || '';
      });
    }
    // Respond with view.
    return {
      data,
      title: 'Server Information',
      partialname
    };
  }
};
