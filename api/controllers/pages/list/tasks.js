const fs = require('fs-extra'),
  path = require('path'),
  partialPath = path.join(__dirname,'..','..','..','..','views','pages','partials','list');
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
  fn: async function (inputs) {
    let req = this.req,
      res = this.res,
      data = {
        header: 'Task List',
        theads: [
          'Title',
          'Description'
        ],
        model: 'task',
        title: 'Task List',
        partialname: false
      };
    let partial = path.join(partialPath, `${data.model}.js`);
    if (fs.existsSync(partial)) {
      data.partialname = partial;
    }
    return data;
  }
};
