const si = require('systeminformation');
const moment = require('moment');
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
    };
    let sysinfo = await si.get(options);
    let user = (sysinfo.currentLoad.currentLoadUser || 0).toFixed(2);
    let sys = (sysinfo.currentLoad.currentLoadSystem || 0).toFixed(2);
    let idle = (sysinfo.currentLoad.currentLoadIdle || 0).toFixed(2);
    let upsecs = sysinfo.time.uptime * 1000;
    let durr = moment.duration(upsecs);
    let uptime = durr.humanize();
    let loadaverage = `User: ${user}, Sys: ${sys}, Idle: ${idle}`;
    return {
      uptime,
      loadaverage
    };
  }
};
