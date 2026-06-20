const si = require('systeminformation'),
  moment = require('moment');
module.exports = {
  friendlyName: 'Info',
  description: 'Info system.',
  inputs: {
  },
  exits: {
  },
  fn: async function (inputs) {
    let options = {
      time: 'uptime',
      currentLoad: 'currentLoadUser, currentLoadSystem, currentLoadIdle',
    },
      sysinfo = await si.get(options),
      user = (sysinfo.currentLoad.currentLoadUser || 0).toFixed(2),
      sys = (sysinfo.currentLoad.currentLoadSystem || 0).toFixed(2),
      idle = (sysinfo.currentLoad.currentLoadIdle || 0).toFixed(2),
      upsecs = sysinfo.time.uptime * 1000,
      durr = moment.duration(upsecs),
      uptime = durr.humanize(),
      loadaverage = `User: ${user}, Sys: ${sys}, Idle: ${idle}`;
    return {
      uptime,
      loadaverage
    }
  }
};
