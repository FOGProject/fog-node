module.exports = {
  friendlyName: 'Search',
  description: 'Search item',
  fn: async function () {
    let req = this.req,
      res = this.res,
      params = req.allParams(),
      query = req.query,
      model = params.model;
    return await sails.models[model].find(query).populateAll();
  }
};
