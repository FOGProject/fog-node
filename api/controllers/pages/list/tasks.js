const fs = require('fs-extra');
const path = require('path');
const partialPath = path.join(__dirname,'..','..','..','..','views','pages','partials','list');
module.exports = {
  friendlyName: 'Tasks',
  description: 'Tasks pages.',
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
        'Title',
        'Description'
      ],
      model: 'task',
      partialname: false
    };
    // The 1.6 title ("All <plural>"), the nouns, the table settings and the
    // edit link base (api/helpers/list-locals.js).
    Object.assign(data, await sails.helpers.listLocals.with({identity: data.model, base: '/tasks'}));
    // FOG 1.6 Tasks is not selectable (TaskManagement.php:59): no Select All,
    // no Deselect All, no "Delete selected" (views/pages/list.ejs).
    data.selectable = false;
    let partial = path.join(partialPath, `${data.model}.js`);
    if (fs.existsSync(partial)) {
      data.partialname = partial;
    }
    return data;
  }
};
