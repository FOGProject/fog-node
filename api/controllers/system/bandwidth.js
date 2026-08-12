const si = require('systeminformation');
const moment = require('moment');
module.exports = {
  friendlyName: 'Bandwidth',
  description: 'Bandwidth system.',
  inputs: {
  },
  exits: {
  },
  fn: async function (inputs) {
    let default_iface = await si.networkInterfaceDefault();
    let netstats = await si.networkStats(default_iface);
    return {
      default_iface,
      netstats
    };
  }
};
