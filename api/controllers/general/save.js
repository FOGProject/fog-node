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
    let values = _.omit(req.allParams(), ['model', '_csrf', 'id', '__primac']);

    // Drop empty strings from array fields (e.g. blank rows in the MAC widget),
    // so the primary (index 0) is never an empty value.
    _.forEach(values, (v, k) => {
      if (_.isArray(v)) {
        values[k] = v.filter((el) => !(typeof el === 'string' && el.trim() === ''));
      }
    });

    // Normalise boolean attributes only. A checkbox paired with a hidden field
    // submits an array (["false","true"] when checked, "false" when not) -- take
    // the last value, then coerce to a real boolean. Legitimate array fields
    // (e.g. a json `macs` list) are left untouched.
    let attrs = sails.models[model].attributes;
    _.forEach(values, (v, k) => {
      if (attrs[k] && attrs[k].type === 'boolean') {
        if (_.isArray(v)) {
          v = v[v.length - 1];
        }
        values[k] = (v === true || v === 'true' || v === 'on' || v === '1');
      }
    });

    // Coerce number attributes. Empty form fields arrive as "" which Waterline
    // rejects for a number type -- omit those (leave the value unchanged on
    // update / use the model default on create) and convert the rest.
    _.forEach(_.keys(values), (k) => {
      if (attrs[k] && attrs[k].type === 'number') {
        let v = values[k];
        if (v === '' || v === null || typeof v === 'undefined') {
          delete values[k];
        } else {
          let n = Number(v);
          if (_.isNaN(n)) {
            delete values[k];
          } else {
            values[k] = n;
          }
        }
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
