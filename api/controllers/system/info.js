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
      currentLoad: 'currentload_user, currentload_system, currentload_idle',
    },
      sysinfo = await si.get(options),
      user = sysinfo.currentLoad.currentload_user.toFixed(2),
      sys = sysinfo.currentLoad.currentload_system.toFixed(2),
      idle = sysinfo.currentLoad.currentload_idle.toFixed(2),
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
