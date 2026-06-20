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

    let attrs = sails.models[model].attributes;

    // Pull out associations: collection (many) associations are applied via
    // replaceCollection() after the record is saved; singleton (model)
    // associations are set inline, with "" meaning "none" (null).
    let collections = {};
    _.forEach(_.keys(values), (k) => {
      let attr = attrs[k];
      if (attr && attr.collection) {
        let v = values[k];
        if (!_.isArray(v)) {
          v = (v === '' || v === null || typeof v === 'undefined') ? [] : [v];
        }
        collections[k] = v.filter((x) => x !== '' && x !== null && typeof x !== 'undefined');
        delete values[k];
      } else if (attr && attr.model) {
        if (values[k] === '' || values[k] === null || typeof values[k] === 'undefined') {
          values[k] = null;
        }
      }
    });

    // Normalise boolean attributes only. A checkbox paired with a hidden field
    // submits an array (["false","true"] when checked, "false" when not) -- take
    // the last value, then coerce to a real boolean. Legitimate array fields
    // (e.g. a json `macs` list) are left untouched.
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

    let recordId = id;
    try {
      if (isUpdate) {
        await sails.models[model].updateOne({ id }).set(values);
      } else {
        let created = await sails.models[model].create(values).fetch();
        recordId = created.id;
      }
      // Apply many-to-many associations (replace == authoritative set).
      for (let assoc of _.keys(collections)) {
        await sails.models[model].replaceCollection(recordId, assoc).members(collections[assoc]);
      }
    } catch (err) {
      let back = isUpdate ? `/${plural}/edit/${id}` : `/${plural}/create`,
        msg = (err && err.message) ? String(err.message).slice(0, 200) : 'Could not save. Please check your input.';
      return res.redirect(`${back}?failed=1&msg=${encodeURIComponent(msg)}`);
    }

    // Stay on the record's edit page with a success flag (instead of bouncing to
    // the list).
    return res.redirect(`/${plural}/edit/${recordId}?saved=1`);
  }
};
