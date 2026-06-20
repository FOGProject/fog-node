const fs = require('fs-extra'),
  path = require('path'),
  partialPath = path.join(__dirname,'..','..','..','..','views','pages','partials','list');
module.exports = {
  friendlyName: 'iPXE Menus',
  description: 'iPXE/PXE boot menu list page.',
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
      header: 'iPXE Menu List',
      theads: [
        'Name',
        'Description',
        'Default'
      ],
      model: 'pxemenu',
      title: 'All iPXE Menus',
      partialname: false
    };
    let partial = path.join(partialPath, `${data.model}.js`);
    if (fs.existsSync(partial)) {
      data.partialname = partial;
    }
    return data;
  }
};
