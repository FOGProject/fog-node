const fs = require('fs-extra'),
  path = require('path'),
  appRoot = path.join(__dirname, '..', '..', '..'),
  partialPath = path.join(appRoot, 'views', 'pages', 'partials'),
  imagePath = `${path.parse(appRoot).root}images`,
  si = require('systeminformation'),
  os = require('os'),
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
  fn: async function (inputs, exits) {
    let free = 0,
      size = 0,
      used = 0,
      defaultInet = await si.networkInterfaceDefault(),
      interfaces = await si.networkInterfaces(),
      webserver = false,
      uptime = await si.time().uptime * 1000,
      loadaverage = await si.currentLoad(),
      legend = [],
      staged=3,
      active=6,
      avail=(10 - (staged + active));

    loadaverage = loadaverage.avgload;
    uptime = moment.duration(uptime);
    uptime = uptime.humanize();

    interfaces.forEach((inet) => {
      if (defaultInet !== inet.ifaceName) {
        return;
      }
      webserver = inet.ip4;
    });

    checkDiskSpace(imagePath).then(async (diskSpace) => {
      size = diskSpace.size;
      free = diskSpace.free;
      used = size - free;
      legend = [
        {
          name: 'Free: ' + await sails.helpers.readableBytes(free),
          color: 'success'
        },
        {
          name: 'Used: ' + await sails.helpers.readableBytes(used),
          color: 'danger'
        }
      ];
      partial = path.join(partialPath, `${data.model}.js`);
      if (fs.existsSync(partial)) {
        data.partialname = partial;
      }
      return exits.success({
        header: 'Dashboard',
        title: 'Dashboard',
        model: 'dashboard',
        partialname: partial,
        free,
        used,
        size,
        legend,
        webserver,
        loadaverage,
        uptime,
        avail: avail,
        staged: staged,
        active: active
      });
    });
    // Respond with view.
    let data = {
      title: 'Dashboard',
      model: 'dashboard',
      partialname: false,
      legend: legend,
      free: free,
      used: used,
      size: size
    };
    let partial = path.join(partialPath, `${data.model}.js`);
    if (fs.existsSync(partial)) {
      data.partialname = partial;
    }
    return data;
  }
};
