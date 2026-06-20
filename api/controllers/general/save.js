module.exports = {
  friendlyName: 'Save',
  description: 'Handle a server-rendered create/edit form POST (e.g. POST /groups/create or POST /groups/edit/:id).',
  exits: {
    success: {
      description: 'Record created/updated; redirected to the list.'
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
      model = plural.replace(/s$/, ''),
      id = req.param('id'),
      isUpdate = !!id;

    if (!model || !sails.models[model]) {
      res.notFound();
      return res.end();
    }

    // Permission: the generic create/update policies can't run here (no :model
    // param), so check the relevant permission for the derived model directly.
    let perm = isUpdate ? 'update' : 'create';
    if (!_.get(req, 'user.permissions.stock.' + model + '.' + perm)) {
      res.forbidden();
      return res.end();
    }

    // Build the values from the body, dropping non-attribute keys.
    let values = _.omit(req.allParams(), ['model', '_csrf', 'id']);

    // A checkbox paired with a hidden field submits an array (["false","true"]
    // when checked, "false" when not); take the last value.
    _.forEach(values, (v, k) => {
      if (_.isArray(v)) {
        values[k] = v[v.length - 1];
      }
    });

    // Coerce boolean attributes from their string form so Waterline accepts them.
    let attrs = sails.models[model].attributes;
    _.forEach(values, (v, k) => {
      if (attrs[k] && attrs[k].type === 'boolean') {
        values[k] = (v === true || v === 'true' || v === 'on' || v === '1');
      }
    });

    try {
      if (isUpdate) {
        await sails.models[model].updateOne({ id }).set(values);
      } else {
        await sails.models[model].create(values);
      }
    } catch (unused) {
      let back = isUpdate ? `/${plural}/edit/${id}` : `/${plural}/create`;
      return res.redirect(`${back}?failed=1`);
    }

    return res.redirect(`/${plural}`);
  }
};
