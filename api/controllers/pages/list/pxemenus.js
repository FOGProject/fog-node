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
      theads: [
        'Name',
        'Description',
        'Default'
      ],
      model: 'pxemenu',
      partialname: false
    };
    // The 1.6 title, the nouns, the table settings and the edit link base
    // (api/helpers/list-locals.js).
    Object.assign(data, await sails.helpers.listLocals.with({identity: data.model, base: '/pxemenus'}));
    // 1.6 names this list "All Boot Menu Items", not "All iPXE Menus".
    data.page = 'All Boot Menu Items';
    let partial = path.join(partialPath, `${data.model}.js`);
    if (fs.existsSync(partial)) {
      data.partialname = partial;
    }
    return data;
  }
};
