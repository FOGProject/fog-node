const crypto = require('crypto');
module.exports = {
  friendlyName: 'Reset API token',
  description: "Admin: (re)generate another user's API token. Returns the new token once; only its SHA-256 is stored. Web session only.",
  inputs: {
    id: { type: 'string', required: true, description: 'Target user id.' }
  },
  exits: {
    success: { description: 'New token issued.' },
    forbidden: { responseType: 'forbidden' },
    notFound: { responseType: 'notFound' }
  },
  fn: async function (inputs, exits) {
    let req = this.req;
    if (req.authVia === 'apitoken') return exits.forbidden();
    if (!_.get(req, 'user.permissions.stock.user.update')) return exits.forbidden();
    let target = await User.findOne({ id: inputs.id });
    if (!target) return exits.notFound();
    let token = 'fpat_' + crypto.randomBytes(24).toString('hex'),
      hash = crypto.createHash('sha256').update(token).digest('hex');
    await User.updateOne({ id: inputs.id }).set({ apiTokenHash: hash });
    // The plaintext token is returned exactly once; we keep only the hash.
    return exits.success({ ok: true, token });
  }
};
