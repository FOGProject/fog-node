const fs = require('fs-extra');
const path = require('path');
const partialPath = path.join(__dirname,'..','..','..','..','views','pages','partials','list');
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
  fn: async function () {
    let data = {
      header: 'iPXE Menu List',
      theads: [
        'Name',
        'Description',
        'Default'
      ],
      model: 'pxemenu',
      partialname: false
    };
    // The FOG 1.6 content header and tab title. 1.6 names this list "All Boot
    // Menu Items", not "All iPXE Menus".
    data.section = sails.helpers.pageTitle.with({identity: data.model}).section;
    data.page = 'All Boot Menu Items';
    let partial = path.join(partialPath, `${data.model}.js`);
    if (fs.existsSync(partial)) {
      data.partialname = partial;
    }
    return data;
  }
};
