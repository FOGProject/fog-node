const fs = require('fs-extra'),
  path = require('path'),
  partialPath = path.join(__dirname, '..', '..', '..','views','pages','partials');
module.exports = {
  friendlyName: 'Users',
  description: 'Users pages.',
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
        header: 'User List',
        theads: [
          'Display Name',
          'Username',
          'Email'
        ],
        model: 'user',
        title: 'User List',
        partialname: false
      };
    let partial = path.join(partialPath, `${data.model}.js`);
    if (fs.existsSync(partial)) {
      data.partialname = partial;
    }
    return data;
  }
};
