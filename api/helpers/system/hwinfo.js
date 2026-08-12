const si = require('systeminformation');
const fs = require('fs-extra');
const path = require('path');
const appRoot = path.join(__dirname, '..', '..', '..');
const moment = require('moment');
const checkDiskSpace = require('check-disk-space').default;
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
    let default_iface = await si.networkInterfaceDefault();
    let network_ifaces = await si.networkInterfaces();
    let ifaces = [];
    let serverip;
    let sysinfo = await si.get({
      cpu: 'vendor, brand, physicalCores, speed, cache',
      mem: 'total, free, used',
      time: 'uptime',
      currentLoad: 'currentLoadUser, currentLoadSystem, currentLoadIdle',
      osInfo: 'hostname'
    });
    let user = (sysinfo.currentLoad.currentLoadUser || 0).toFixed(2);
    let sys = (sysinfo.currentLoad.currentLoadSystem || 0).toFixed(2);
    let idle = (sysinfo.currentLoad.currentLoadIdle || 0).toFixed(2);
    let upsecs = sysinfo.time.uptime * 1000;
    let durr = moment.duration(upsecs);
    let uptime = durr.humanize();
    let hostname = sysinfo.osInfo.hostname;
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
    let imagePath = sails.config.custom.imageStorePath || '/images';
    size = await checkDiskSpace(imagePath).then(async diskspace => {
      let free = diskspace.free;
      let total = diskspace.size;
      let used = total - free;
      return {
        path: diskspace.diskPath,
        total: await sails.helpers.readableBytes(total),
        free: await sails.helpers.readableBytes(free),
        used: await sails.helpers.readableBytes(used)
      };
    });

    // Network information
    for (var i = 0; i < network_ifaces.length; i++) {
      iface = network_ifaces[i];
      if (default_iface === iface.iface) {
        serverip = iface.ip4;
      }
      await si.networkStats(iface.iface).then(async tmpi => {
        tmpi.forEach(async tmp => {
          let netif = network_ifaces.find(n => n.iface === tmp.iface);
          setIfaces({
            name: tmp.iface,
            mac: (netif && netif.mac) ? netif.mac : '',
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
