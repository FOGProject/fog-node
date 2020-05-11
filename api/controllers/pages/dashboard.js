const fs = require('fs-extra'),
  path = require('path'),
  partialPath = path.join(__dirname, '..', '..', '..','views','pages','partials');
module.exports = {
  friendlyName: 'View dashboard',
  description: 'Display "Dashboard" page.',
  exits: {
    success: {
      viewTemplatePath: 'pages/dashboard'
    }
  },
  fn: async function () {
    // Respond with view.
    let data = {
      title: 'Dashboard',
      model: 'dashboard',
      partialname: false
    };
    let partial = path.join(partialPath, `${data.model}.js`);
    if (fs.existsSync(partial)) {
      data.partialname = partial;
    }
    return data;
  }
};
