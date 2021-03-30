const fs = require('fs-extra'),
  path = require('path'),
  partialPath = path.join(__dirname,'..','..','..','..','views','pages','partials','list');
module.exports = {
  friendlyName: 'Images',
  description: 'Images pages.',
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
        header: 'Image List',
        theads: [
          'Name',
          'Protected',
          'Enabled',
          'Captured'
        ],
        model: 'image',
        title: 'Image List',
        partialname: false
      };
    let partial = path.join(partialPath, `${data.model}.js`);
    if (fs.existsSync(partial)) {
      data.partialname = partial;
    }
    return data;
  }
};
