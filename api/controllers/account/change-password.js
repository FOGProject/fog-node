const bcrypt = require('bcryptjs');
module.exports = {
  friendlyName: 'Change password',
  description: 'Logged-in user changes their own password (verifies the current one first). Never via an API token.',
  inputs: {
    currentPassword: { type: 'string', required: true },
    password: { type: 'string', required: true, minLength: 8 },
    passwordConfirm: { type: 'string', required: true }
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
    if (inputs.password !== inputs.passwordConfirm) return exits.badRequest({ message: 'New passwords do not match.' });
    // req.user is sanitized (no password hash) -> re-fetch the record to verify.
    let me = await User.findOne({ id: req.user.id });
    if (!me) return exits.forbidden();
    let match = await bcrypt.compare(inputs.currentPassword, me.password);
    if (!match) return exits.badRequest({ message: 'Current password is incorrect.' });
    await User.updateOne({ id: me.id }).set({ password: inputs.password });
    return exits.success({ ok: true });
  }
};
