const si = require('systeminformation'),
  fs = require('fs-extra'),
  path = require('path'),
  appRoot = path.join(__dirname, '..', '..', '..'),
  imagePath = `${path.parse(appRoot).root}images`,
  moment = require('moment'),
  checkDiskSpace = require('check-disk-space');
module.exports = {
  friendlyName: 'Hwinfo',
  description: 'Hwinfo system.',
  inputs: {
  },
  exits: {
    success: {
      description: 'All done.',
    },
  },
  fn: async function (inputs) {
    let default_iface = await si.networkInterfaceDefault(),
      network_ifaces = await si.networkInterfaces(),
      ifaces = [],
      serverip,
      sysinfo = await si.get({
        cpu: 'vendor, brand, physicalCores, speed, cache',
        mem: 'total, free, used',
        time: 'uptime',
        currentLoad: 'currentload_user, currentload_system, currentload_idle',
        osInfo: 'hostname'
      }),
      user = sysinfo.currentLoad.currentload_user.toFixed(2),
      sys = sysinfo.currentLoad.currentload_system.toFixed(2),
      idle = sysinfo.currentLoad.currentload_idle.toFixed(2),
      upsecs = sysinfo.time.uptime * 1000,
      durr = moment.duration(upsecs),
      uptime = durr.humanize(),
      hostname = sysinfo.osInfo.hostname
      loadaverage = `User: ${user}, Sys: ${sys}, Idle: ${idle}`,
      cpu = sysinfo.cpu,
      memory = sysinfo.mem,
      size = {},
      setIfaces = ifaceitem => {
        ifaces.push(ifaceitem);
      };
    // General information
    Object.keys(cpu.cache).forEach(async key => {
      cpu.cache[key] = await sails.helpers.readableBytes(cpu.cache[key]);
    });
    Object.keys(memory).forEach(async key => {
      memory[key] = await sails.helpers.readableBytes(memory[key]);
    });

    // Filesystem info
    size = await checkDiskSpace(imagePath).then(async diskspace => {
      let free = diskspace.free,
        total = diskspace.size,
        used = total - free;
      return {
        path: diskspace.diskPath,
        total: await sails.helpers.readableBytes(total),
        free: await sails.helpers.readableBytes(free),
        used: await sails.helpers.readableBytes(used)
      };
    });

    // Network information
    for (var i = 0;i < network_ifaces.length; i++) {
      iface = network_ifaces[i];
      if (default_iface === iface.iface) {
        serverip = iface.ip4;
      }
      await si.networkStats(iface.iface).then(async tmpi => {
        tmpi.forEach(async tmp => {
          setIfaces({
            name: tmp.iface,
            tx_bytes: await sails.helpers.readableBytes(tmp.tx_bytes),
            rx_bytes: await sails.helpers.readableBytes(tmp.rx_bytes),
            tx_errors: tmp.tx_errors,
            rx_errors: tmp.rx_errors,
            tx_dropped: tmp.tx_dropped,
            rx_dropped: tmp.rx_dropped
          });
        });
      });
    }

    // Return all the info
    return {
      general: {
        serverip,
        hostname,
        uptime,
        loadaverage,
        cpu,
        memory
      },
      fsinfo: {
        size
      },
      networkInfo: {
        ifaces
      }
    };
  }
};
