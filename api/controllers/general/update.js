module.exports = {
  friendlyName: 'Update',
  description: 'Update Item',
  exits: {
    conflict: {
      statusCode: 409,
      description: 'An item already exists with that name'
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
    let obj = await sails.models[model].updateOne({id}, params)
      // See the matching note in general/create.js: the adapter error carries
      // no detail worth surfacing, so it is deliberately dropped.
      .intercept('E_UNIQUE', (unusedErr) => {
        return {conflict: {message: 'A record already exists with that name'}};
      })
      .intercept({name: 'UsageError'}, (err) => {
        return {badRequest: err};
      });
    return await sails.models[model].findOne({id: obj.id}).populateAll();
  }
};
