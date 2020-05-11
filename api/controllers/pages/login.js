const fs = require('fs-extra'),
  path = require('path'),
  partialPath = path.join(__dirname, '..', '..', '..','views','pages','partials');
module.exports = {
  friendlyName: 'View login',
  description: 'Display "Login" page.',
  exits: {
    success: {
      viewTemplatePath: 'pages/login'
    }
  },
  fn: async function () {
    // Respond with view.
    let data = {
      title: 'Login',
      model: 'login',
      partialname: false
    };
    let partial = path.join(partialPath, `${data.model}.js`);
    if (fs.existsSync(partial)) {
      data.partialname = partial;
    }
    return data;
  }
};
