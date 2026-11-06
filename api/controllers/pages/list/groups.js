const fs = require('fs-extra');
const path = require('path');
const partialPath = path.join(__dirname,'..','..','..','..','views','pages','partials','list');
module.exports = {
  friendlyName: 'Groups',
  description: 'Group list page.',
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
      // The 1.6 headers (GroupManagement.php ~62-70). Members and Grants are
      // computed per row (api/helpers/datatables/get-data.js).
      theads: [
        'Name',
        'Members',
        'Grants'
      ],
      model: 'group',
      partialname: false
    };
    // The 1.6 title ("All <plural>"), the nouns, the table settings and the
    // edit link base (api/helpers/list-locals.js).
    Object.assign(data, await sails.helpers.listLocals.with({identity: data.model, base: '/groups'}));
    let partial = path.join(partialPath, `${data.model}.js`);
    if (fs.existsSync(partial)) {
      data.partialname = partial;
    }
    return data;
  }
};
