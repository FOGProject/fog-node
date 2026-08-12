const si = require('systeminformation');
module.exports = {
  friendlyName: 'Bandwidth',
  description: 'Bandwidth system.',
  inputs: {
  },
  exits: {
  },
  fn: async function () {
    let defaultIface = await si.networkInterfaceDefault();
    let netstats = await si.networkStats(defaultIface);
    return {
      // Key kept snake_case: it is part of the /bandwidth response shape.
      default_iface: defaultIface,
      netstats
    };
  }
};
