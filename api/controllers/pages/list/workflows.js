const fs = require('fs-extra');
const path = require('path');
const partialPath = path.join(__dirname,'..','..','..','..','views','pages','partials','list');
module.exports = {
  friendlyName: 'Workflows',
  description: 'Workflows pages.',
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
      header: 'Workflow List',
      theads: [
        'Name',
        'Description'
      ],
      model: 'workflow',
      partialname: false
    };
    // The FOG 1.6 content header and tab title read the section, then "All <plural>".
    let names = sails.helpers.pageTitle.with({identity: data.model});
    data.section = names.section;
    data.page = `All ${names.plural}`;
    let partial = path.join(partialPath, `${data.model}.js`);
    if (fs.existsSync(partial)) {
      data.partialname = partial;
    }
    return data;
  }
};
