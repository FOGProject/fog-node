module.exports = {
  friendlyName: 'Save',
  description: 'Handle a server-rendered create form POST (e.g. POST /groups/create).',
  exits: {
    success: {
      description: 'Record created; redirected to the list.'
    },
    error: {
      responseType: 'serverError'
    }
  },
  fn: async function () {
    let req = this.req,
      res = this.res,
      // Derive the model from the URL, e.g. /groups/create -> group
      segments = req.path.split('/').filter(Boolean),
      plural = segments[0],
      model = plural.replace(/s$/, '');

    if (!model || !sails.models[model]) {
      res.notFound();
      return res.end();
    }

    // Permission: the generic `create` policy can't run here (no :model param),
    // so check the create permission for the derived model directly.
    if (!_.get(req, 'user.permissions.stock.' + model + '.create')) {
      res.forbidden();
      return res.end();
    }

    // Build the values from the body, dropping non-attribute keys.
    let values = _.omit(req.allParams(), ['model', '_csrf']);

    try {
      await sails.models[model].create(values)
        .intercept('E_UNIQUE', () => 'unique')
        .intercept({ name: 'UsageError' }, () => 'usage');
    } catch (unused) {
      return res.redirect(`/${plural}/create?failed=1`);
    }

    return res.redirect(`/${plural}`);
  }
};
