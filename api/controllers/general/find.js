module.exports = {
  friendlyName: 'Find',
  description: 'Find user.',
  fn: async function () {
    let req = this.req,
      res = this.res,
      params = req.allParams(),
      model = params.model,
      id = params.id;
    return await sails.models[model].findOne({id}).populateAll();
  }
};
