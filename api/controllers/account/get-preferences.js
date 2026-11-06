const UserPrefStore = require('../../services/UserPrefStore');
module.exports = {
  friendlyName: 'Get preferences',
  description: 'The logged-in user\'s own preferences, as {key: value}. Never via an API token: preferences are browser state.',
  exits: {
    success: {},
    forbidden: { responseType: 'forbidden' }
  },
  fn: async function (inputs, exits) {
    let req = this.req;
    if (req.authVia === 'apitoken') return exits.forbidden();
    if (!req.user) return exits.forbidden();
    return exits.success(await UserPrefStore.read(req.user.id));
  }
};
