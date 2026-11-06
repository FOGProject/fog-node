module.exports = {
  friendlyName: 'Create',
  description: 'Create Item',
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
    // API-token requests may never write credentials (password / apiTokenHash).
    if (req.authVia === 'apitoken') { delete params.password; delete params.apiTokenHash; }
    // A Group name that is not text (400) or is taken without case (409), or
    // a host's groups change that the caller may not make (403).
    let check = await sails.helpers.group.checkSave.with({model, values: params, permissions: req.user.permissions});
    if (check.error) {
      throw {[{400: 'badRequest', 403: 'forbidden', 409: 'conflict'}[check.error.status]]: {message: check.error.message}};
    }
    let obj = await sails.models[model].create(params)
      // The adapter error carries no detail worth surfacing here, so it is
      // deliberately dropped in favour of a fixed message; named `unusedErr`
      // to say so rather than leaving a silently-ignored `err`. A Group
      // duplicate (two concurrent creates) gets the 1.6 text.
      .intercept('E_UNIQUE', (unusedErr) => {
        return {conflict: {message: model === 'group' ? sails.models.group.existsText : 'A record already exists with that name'}};
      })
      .intercept({name: 'UsageError'}, (err) => {
        return {badRequest: err};
      })
      .fetch();
    return await sails.models[model].findOne({id: obj.id}).populateAll();
  }
};
