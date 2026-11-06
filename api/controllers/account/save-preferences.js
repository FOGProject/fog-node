const UserPrefStore = require('../../services/UserPrefStore');
module.exports = {
  friendlyName: 'Save preferences',
  description: 'The logged-in user sets one of their own preferences, or deletes it when the value is "" or null. Returns the new map. Never via an API token: preferences are browser state.',
  inputs: {
    // `ref`: UserPrefStore validates both, so a rejection is a 400 with its own
    // `error` message, not the generic input-validation response.
    key: { type: 'ref' },
    value: { type: 'ref' }
  },
  exits: {
    success: {},
    forbidden: { responseType: 'forbidden' },
    badRequest: { responseType: 'badRequest' }
  },
  fn: async function (inputs, exits) {
    let req = this.req;
    if (req.authVia === 'apitoken') return exits.forbidden();
    if (!req.user) return exits.forbidden();
    let result = await UserPrefStore.save(req.user.id, inputs.key, inputs.value);
    if (result.error) return exits.badRequest({ error: result.error });
    return exits.success(result.prefs);
  }
};
