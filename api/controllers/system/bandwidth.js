const si = require('systeminformation'),
  moment = require('moment');
module.exports = {
  friendlyName: 'Bandwidth',
  description: 'Bandwidth system.',
  inputs: {
  },
  exits: {
  },
  fn: async function (inputs) {
    let default_iface = await si.networkInterfaceDefault(),
      netstats = await si.networkStats(default_iface);
    return {
      default_iface,
      netstats
    };
  }
};
