const fs = require('fs-extra'),
  path = require('path'),
  appRoot = path.join(__dirname, '..', '..', '..'),
  partialPath = path.join(appRoot, 'views', 'pages', 'partials'),
  imagePath = path.join(appRoot,'images'),
  si = require('systeminformation'),
  os = require('os'),
  moment = require('moment'),
  checkDiskSpace = require('check-disk-space');
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
      legend = [];
    function readableBytes(bytes) {
      var i = Math.floor(Math.log(bytes) / Math.log(1024));
      sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

      return (bytes / Math.pow(1024, i)).toFixed(2) * 1 + ' ' + sizes[i];
    };

    loadaverage = loadaverage.avgload;
    uptime = moment.duration(uptime);
    uptime = uptime.humanize();

    interfaces.forEach((inet) => {
      if (defaultInet !== inet.ifaceName) {
        return;
      }
      webserver = inet.ip4;
    });

    checkDiskSpace(imagePath).then((diskSpace) => {
      size = diskSpace.size;
      free = diskSpace.free;
      used = size - free;
      legend = [
        {
          name: 'Free: ' + readableBytes(free),
          color: 'success'
        },
        {
          name: 'Used: ' + readableBytes(used),
          color: 'danger'
        },
        {
          name: 'Total: ' + readableBytes(size),
          color: 'primary'
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
        uptime
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
