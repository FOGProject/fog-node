const crypto = require('crypto');
module.exports = {
  friendlyName: 'Reset my API token',
  description: 'Logged-in user (re)generates their own API token. Returns it once; only its SHA-256 is stored.',
  exits: {
    success: {},
    forbidden: { responseType: 'forbidden' }
  },
  fn: async function (inputs, exits) {
    let req = this.req;
    if (req.authVia === 'apitoken') return exits.forbidden();
    if (!req.user) return exits.forbidden();
    let token = 'fpat_' + crypto.randomBytes(24).toString('hex'),
      hash = crypto.createHash('sha256').update(token).digest('hex');
    await User.updateOne({ id: req.user.id }).set({ apiTokenHash: hash });
    return exits.success({ ok: true, token });
  }
};
