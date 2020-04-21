module.exports = {
  friendlyName: 'List',
  description: 'List user.',
  fn: async function () {
    let req = this.req,
      res = this.res,
      params = req.allParams(),
      model = params.model;
    return await sails.models[model].find().populateAll();
  }
};
