const fs = require('fs-extra');
const path = require('path');
const partialPath = path.join(__dirname, '..', '..', '..','views','pages','partials');
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
      // The tab title, "Login | FOG Project" (1.6 management/index.php:211).
      // The signed-out layout renders no content header.
      page: 'Login',
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
