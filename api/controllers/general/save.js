module.exports = {
  friendlyName: 'Save',
  description: 'Handle a server-rendered create/edit form POST (e.g. POST /hosts/create or POST /hosts/edit/:id).',
  exits: {
    success: {
      description: 'Record created/updated; redirected to the list.'
    },
    error: {
      responseType: 'serverError'
    }
  },
  fn: async function () {
    let req = this.req;
    let res = this.res;
    // Derive the model from the URL, e.g. /hosts/create -> host
    let segments = req.path.split('/').filter(Boolean);
    let plural = segments[0];
    let model = plural.replace(/s$/, '');
    let id = req.param('id');
    let isUpdate = !!id;

    if (!model || !sails.models[model]) {
      res.notFound();
      return res.end();
    }

    // Permission: the generic create/update policies can't run here (no :model
    // param), so check the relevant permission for the derived model directly.
    let perm = isUpdate ? 'update' : 'create';
    // The audit trail (api/hooks/audit): the permission before the decision,
    // and the row once it is known.
    sails.helpers.audit.subject(req, model, null, id);
    if (!sails.helpers.audit.can(req, model + '.' + perm)) {
      res.forbidden();
      return res.end();
    }

    // Build the values from the body, dropping non-attribute keys.
    let values = _.omit(req.allParams(), ['model', '_csrf', 'id', '__primac']);
    // The host's agent fields are server-owned: only the enroll code writes them.
    if (model === 'host') { values = _.omit(values, sails.models.host.serverOwned); }

    // API-token requests may never write credentials (password / apiTokenHash).
    if (req.authVia === 'apitoken') { delete values.password; delete values.apiTokenHash; }

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
    // The 1.6 toast texts and titles name the model, in the same shape on
    // each page: "Host added!" / "Host Create Success" / "Host Create Fail"
    // after a create, "Host updated!" / "Host Update Success" / "Host Update
    // Fail" after an update (GroupManagement.php ~187-189, ~1917-1919).
    let names = sails.helpers.pageTitle.with({identity: model});
    let singular = names ? names.singular : model.charAt(0).toUpperCase() + model.slice(1);
    let verb = isUpdate ? 'Update' : 'Create';
    let doneText = isUpdate ? `${singular} updated!` : `${singular} added!`;
    let failTitle = `${singular} ${verb} Fail`;
    // The status of a JSON failure answer: 403 for a denied group change.
    let failStatus = 400;
    // A Group rename: the name read before the update, for group/rename after it.
    let oldGroup;
    try {
      // A Group name taken without case, or a host's groups change that the
      // caller may not make (403 to a JSON caller).
      let check = await sails.helpers.group.checkSave.with({
        model, id: isUpdate ? id : undefined, values, permissions: req.user.permissions
      });
      if (check.error) {
        if (check.error.status === 403) {
          failStatus = 403;
          // The group permission that refused it (the audit trail).
          _.set(req, 'audit.permission', check.error.permission);
        }
        throw new Error(check.error.message);
      }
      oldGroup = check.oldGroup;
      // False when an update matched no record: then no plugin writes a row
      // for it, because no destroy would ever delete that row.
      let exists = true;
      if (isUpdate) {
        let saved = await sails.models[model].updateOne({ id }).set(values);
        exists = !!saved;
        if (saved) { sails.helpers.audit.subject(req, model, saved); }
        // The members keep their membership through a rename, as in 1.6.
        if (oldGroup && saved && saved.name !== oldGroup.name) {
          await sails.helpers.group.rename.with({from: oldGroup.name, to: saved.name});
        }
      } else {
        let created = await sails.models[model].create(values).fetch();
        recordId = created.id;
        sails.helpers.audit.subject(req, model, created);
      }
      // Apply many-to-many associations (replace == authoritative set).
      for (let assoc of _.keys(collections)) {
        await sails.models[model].replaceCollection(recordId, assoc).members(collections[assoc]);
      }
      // Let plugins persist their slice of a host save (their own collections).
      if (exists && model === 'host' && sails.plugins && sails.plugins.hostSave) {
        await sails.plugins.hostSave(recordId, req.allParams());
      }
      // A grant save is a group edit: only an update, which the
      // group.update check above already passed. A create grants nothing.
      if (exists && isUpdate && model === 'group' && sails.plugins && sails.plugins.groupSave) {
        await sails.plugins.groupSave(recordId, req.allParams());
      }
    } catch (err) {
      let msg = (err && err.message) ? String(err.message).slice(0, 200) : 'Could not save. Please check your input.';
      // A Group duplicate that got past the check above (a concurrent create
      // or rename) hits the unique name index: the same 1.6 text.
      if (model === 'group' && err && err.code === 'E_UNIQUE') {
        msg = isUpdate ? sails.models.group.takenText : sails.models.group.existsText;
      }
      // The audit trail: a full-page failure answers 302, which the seam
      // would read as allowed. A refused group change is denied, any other
      // error is failed.
      req.audit.outcome = failStatus === 403 ? 'denied' : 'failed';
      // Modal/AJAX submit -> JSON, and the modal shows the message itself;
      // full-page submit -> back to the form, with the message as a toast on
      // the next page (api/helpers/flash.js).
      if (req.wantsJSON) {
        return res.status(failStatus).json({ ok: false, message: msg, title: failTitle });
      }
      sails.helpers.flash.with({req, type: 'error', text: msg, title: failTitle});
      return res.redirect(isUpdate ? `/${plural}/edit/${id}` : `/${plural}/create`);
    }

    // Modal/AJAX submit -> JSON ({ok, id, msg, title}), and the modal toasts
    // msg with title; full-page submit -> the record's edit page, with the
    // same toast there.
    if (req.wantsJSON) {
      return res.json({ ok: true, id: recordId, msg: doneText, title: `${singular} ${verb} Success` });
    }
    sails.helpers.flash.with({req, type: 'success', text: doneText, title: `${singular} ${verb} Success`});
    return res.redirect(`/${plural}/edit/${recordId}`);
  }
};
