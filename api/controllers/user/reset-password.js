module.exports = {
  friendlyName: 'Reset password',
  description: "Admin: set a new password for another user. Web session only -- never via an API token.",
  inputs: {
    id: { type: 'string', required: true, description: 'Target user id.' },
    password: { type: 'string', required: true, minLength: 8 },
    passwordConfirm: { type: 'string', required: true }
  },
  exits: {
    success: { description: 'Password reset.' },
    forbidden: { responseType: 'forbidden' },
    notFound: { responseType: 'notFound' },
    badRequest: { responseType: 'badRequest' }
  },
  fn: async function (inputs, exits) {
    let req = this.req;
    // Password changes are never permitted over an API token.
    if (req.authVia === 'apitoken') return exits.forbidden();
    if (!_.get(req, 'user.permissions.stock.user.update')) return exits.forbidden();
    if (inputs.password !== inputs.passwordConfirm) return exits.badRequest({ message: 'Passwords do not match.' });
    let target = await User.findOne({ id: inputs.id });
    if (!target) return exits.notFound();
    // The model's beforeUpdate hook hashes the new password.
    await User.updateOne({ id: inputs.id }).set({ password: inputs.password });
    return exits.success({ ok: true });
  }
};
