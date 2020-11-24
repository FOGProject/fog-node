const si = require('systeminformation'),
  fs = require('fs-extra'),
  path = require('path'),
  appRoot = path.join(__dirname, '..', '..', '..'),
  imagePath = `${path.parse(appRoot).root}images`;
  moment = require('moment'),
  checkDiskSpace = require('check-disk-space');
module.exports = {
  friendlyName: 'Info',
  description: 'Info system.',
  inputs: {
  },
  exits: {
  },
  fn: async function (inputs) {
    let default_iface = await si.networkInterfaceDefault(),
      network_ifaces = await si.networkInterfaces(),
      ifaces = [],
      ifacenames = [],
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
      loadaverage = `User: ${user}, Sys: ${sys}, Idle: ${idle}`,
      hostname = sysinfo.osInfo.hostname,
      serverip;
    var size = {
        free: 0,
        used: 0,
        total: 0
      };
    cpu = sysinfo.cpu;
    cpu.speed += ' GHz';
    memory = sysinfo.mem;
    function readableBytes(bytes) {
      var i = Math.floor(Math.log(bytes) / Math.log(1024));
      sizes = ['iB', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];

      return (bytes / Math.pow(1024, i)).toFixed(2) * 1 + ' ' + sizes[i];
    };

    function setIfaces(ifaceitem) {
      ifaces.push(ifaceitem);
    }

    for (var i = 0;i < network_ifaces.length;i++) {
      iface = network_ifaces[i];
      if (default_iface === iface.iface) {
        serverip = iface.ip4
      }
      await si.networkStats(iface.iface).then(tmpi => {
        tmpi.forEach(tmp => {
          setIfaces({
            name: tmp.iface,
            tx_bytes: readableBytes(tmp.tx_bytes),
            rx_bytes: readableBytes(tmp.rx_bytes),
            tx_errors: tmp.tx_errors,
            rx_errors: tmp.rx_errors,
            tx_dropped: tmp.tx_dropped,
            rx_dropped: tmp.rx_dropped
          });
        });
      });
    }
    Object.keys(cpu.cache).forEach(key => {
      cpu.cache[key] = readableBytes(cpu.cache[key]);
    });
    Object.keys(memory).forEach(key => {
      memory[key] = readableBytes(memory[key]);
    });
    size = await checkDiskSpace(imagePath).then(diskspace => {
      return {
        path: diskspace.diskPath,
        total: readableBytes(diskspace.size),
        free: readableBytes(diskspace.free),
        used: readableBytes(diskspace.size - diskspace.free)
      };
    });

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
    }
  }
};
