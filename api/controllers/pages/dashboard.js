const fs = require('fs-extra'),
  path = require('path'),
  appRoot = path.join(__dirname, '..', '..', '..'),
  partialPath = path.join(appRoot, 'views', 'pages', 'partials'),
  si = require('systeminformation'),
  moment = require('moment'),
  checkDiskSpace = require('check-disk-space').default;
module.exports = {
  friendlyName: 'View dashboard',
  description: 'Display "Dashboard" page.',
  exits: {
    success: {
      viewTemplatePath: 'pages/dashboard'
    }
  },
  fn: async function () {
    let webserver = 'Unknown',
      defaultInet = await si.networkInterfaceDefault(),
      interfaces = await si.networkInterfaces(),
      timeInfo = await si.time(),
      uptime = moment.duration((timeInfo.uptime || 0) * 1000).humanize(),
      load = await si.currentLoad(),
      loadaverage = 'N/A';

    // systeminformation v5: currentLoad() -> avgLoad / currentLoad (camelCase)
    if (load) {
      if (typeof load.avgLoad === 'number') {
        loadaverage = load.avgLoad;
      } else if (typeof load.currentLoad === 'number') {
        loadaverage = `${load.currentLoad.toFixed(2)}%`;
      }
    }

    // systeminformation v5: networkInterfaces() entries use `iface`
    (Array.isArray(interfaces) ? interfaces : [interfaces]).forEach((inet) => {
      if (inet && inet.iface === defaultInet) {
        webserver = inet.ip4;
      }
    });

    // Disk usage of the image store. Fall back to the filesystem root when the
    // image path does not exist (e.g. in development).
    let imagePath = sails.config.custom.imageStorePath || '/images',
      free = 0, size = 0, used = 0;
    try {
      let diskSpace = await checkDiskSpace(imagePath);
      size = diskSpace.size; free = diskSpace.free; used = size - free;
    } catch (unused) {
      try {
        let diskSpace = await checkDiskSpace(path.parse(appRoot).root);
        size = diskSpace.size; free = diskSpace.free; used = size - free;
      } catch (unused2) { /* leave zeros */ }
    }

    let legend = [
      { name: 'Free: ' + await sails.helpers.readableBytes(free), color: 'success' },
      { name: 'Used: ' + await sails.helpers.readableBytes(used), color: 'danger' }
    ];

    // Imaging activity from the Task collection. `state < 5` = not finished
    // (same convention as task-history); among those, in-progress (progress > 0)
    // is Active and not-yet-started is Staged. "Available" = open imaging slots =
    // total enabled storage-node capacity (sum of maxClients) minus what's in use.
    // (The active/staged split is provisional until the Task state enum is fixed.)
    let active = await Task.count({ state: { '<': 5 }, progress: { '>': 0 } }),
      staged = await Task.count({ state: { '<': 5 }, progress: 0 }),
      storageNodes = await StorageNode.find({ isEnabled: true }),
      capacity = storageNodes.reduce((sum, n) => sum + (Number(n.maxClients) || 0), 0),
      avail = Math.max(0, capacity - active - staged);

    // Alerts panel (parity with 1.x dashboard): hosts awaiting approval.
    let pendingHosts = await Host.count({ pending: true });

    let data = {
      header: 'Dashboard',
      title: 'Dashboard',
      model: 'dashboard',
      partialname: false,
      free, used, size, legend,
      webserver, loadaverage, uptime,
      avail, staged, active,
      pendingHosts
    };
    let partial = path.join(partialPath, `${data.model}.js`);
    if (fs.existsSync(partial)) {
      data.partialname = partial;
    }
    return data;
  }
};
