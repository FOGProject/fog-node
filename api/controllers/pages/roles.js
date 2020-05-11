const fs = require('fs-extra'),
  path = require('path'),
  partialPath = path.join(__dirname, '..', '..', '..','views','pages','partials');
module.exports = {
  friendlyName: 'Roles',
  description: 'Roles pages.',
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
        header: 'Role List',
        theads: [
          'Name',
          'Description',
          'Is Admin?'
        ],
        model: 'role',
        title: 'Role List',
        partialname: false
      };
    let partial = path.join(partialPath, `${data.model}.js`);
    if (fs.existsSync(partial)) {
      data.partialname = partial;
    }
    return data;
  }
};
