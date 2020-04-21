module.exports = {
  friendlyName: 'Create',
  description: 'Create Item',
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
    let req = this.req,
      res = this.res,
      params = req.allParams(),
      model = params.model,
      obj = await sails.models[model].create(params)
      .intercept('E_UNIQUE', (err) => {
        return {conflict: {message: 'A record already exists with that name'}};
      })
      .intercept({name: 'UsageError'}, (err) => {
        return {badRequest: err};
      })
      .fetch();
    return await sails.models[model].findOne({id: obj.id}).populateAll();
  }
};
