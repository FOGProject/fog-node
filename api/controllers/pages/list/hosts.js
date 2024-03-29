const fs = require('fs-extra'),
  path = require('path'),
  partialPath = path.join(__dirname,'..','..','..','..','views','pages','partials','list');
module.exports = {
  friendlyName: 'Hosts',
  description: 'Hosts pages.',
  inputs: {
  },
  exits: {
    error: {
      responseType: 'serverError'
    },
    success: {
      viewTemplatePath: 'pages/list',
      description: 'Successful'
    }
  },
  fn: async function (inputs) {
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
