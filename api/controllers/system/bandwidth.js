const si = require('systeminformation');
module.exports = {
  friendlyName: 'Bandwidth',
  description: 'Bandwidth system.',
  inputs: {
  },
  exits: {
  },
  fn: async function () {
    let default_iface = await si.networkInterfaceDefault();
    let netstats = await si.networkStats(default_iface);
    return {
      default_iface,
      netstats
    };
  }
};
