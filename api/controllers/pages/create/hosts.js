const fs = require('fs-extra'),
  path = require('path'),
  partialPath = path.join(__dirname, '..', '..', '..','views','pages','partials','create');
module.exports = {
  friendlyName: 'View hosts create',
  description: 'Display "Hosts create" page.',
  exits: {
    success: {
      viewTemplatePath: 'pages/create'
    }
  },
  fn: async function () {
    let req = this.req,
      res = this.res,
      data = {
        header: 'Host List',
        theads: [
          'Host',
          'Primary MAC',
          'Ping Status',
          'Last Deployed',
          'Assigned Image',
          'Description'
        ],
        model: 'host',
        title: 'All Hosts',
        partialname: false
      };
    let partial = path.join(partialPath, `${data.model}.js`);
    if (fs.existsSync(partial)) {
      data.partialname = partial;
    }
    return data;
  }
};
