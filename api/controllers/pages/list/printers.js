const fs = require('fs-extra'),
  path = require('path'),
  partialPath = path.join(__dirname,'..','..','..','..','views','pages','partials','list');
module.exports = {
  friendlyName: 'Printers',
  description: 'Printer list page.',
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
    let data = {
      header: 'Printer List',
      theads: [
        'Name',
        'IP Address',
        'Model'
      ],
      model: 'printer',
      title: 'All Printers',
      partialname: false
    };
    let partial = path.join(partialPath, `${data.model}.js`);
    if (fs.existsSync(partial)) {
      data.partialname = partial;
    }
    return data;
  }
};
