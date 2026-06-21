module.exports = {
  friendlyName: 'Account',
  description: 'Self-service account page: change own password and manage own API token.',
  exits: {
    success: { viewTemplatePath: 'pages/account' }
  },
  fn: async function () {
    let req = this.req;
    return {
      header: 'My Account',
      title: 'My Account',
      username: req.user.username,
      displayName: req.user.displayName || req.user.username,
      partialname: false
    };
  }
};
