module.exports = {
  friendlyName: 'Update',
  description: 'Update Item',
  exits: {
    conflict: {
      statusCode: 409,
      description: 'An item already exists with that name'
    },
    forbidden: {
      statusCode: 403,
      description: 'The caller may not make this group membership change'
    },
    badRequest: {
      responseType: 'badRequest',
      description: 'A usage error has occurred'
    },
    error: {
      responseType: 'serverError',
      description: 'A server error has occurred'
    }
  },
  fn: async function() {
    let req = this.req;
    let params = req.allParams();
    let model = params.model;
    let id = params.id;
    // API-token requests may never write credentials (password / apiTokenHash).
    if (req.authVia === 'apitoken') { delete params.password; delete params.apiTokenHash; }
    // A Group name that is not text (400) or is taken without case (409), or
    // a host's groups change that the caller may not make (403). oldGroup is
    // the Group before a rename.
    let check = await sails.helpers.group.checkSave.with({model, id, values: params, permissions: req.user.permissions});
    if (check.error) {
      throw {[{400: 'badRequest', 403: 'forbidden', 409: 'conflict'}[check.error.status]]: {message: check.error.message}};
    }
    let oldGroup = check.oldGroup;
    let obj = await sails.models[model].updateOne({id}, params)
      // See the matching note in general/create.js: the adapter error carries
      // no detail worth surfacing, so it is deliberately dropped. A Group
      // duplicate (a concurrent create or rename) gets the 1.6 text.
      .intercept('E_UNIQUE', (unusedErr) => {
        return {conflict: {message: model === 'group' ? sails.models.group.takenText : 'A record already exists with that name'}};
      })
      .intercept({name: 'UsageError'}, (err) => {
        return {badRequest: err};
      });
    // The members keep their membership through a rename, as in 1.6.
    if (oldGroup && obj && obj.name !== oldGroup.name) {
      await sails.helpers.group.rename.with({from: oldGroup.name, to: obj.name});
    }
    return await sails.models[model].findOne({id: obj.id}).populateAll();
  }
};
