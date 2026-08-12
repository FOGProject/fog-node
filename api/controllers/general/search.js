module.exports = {
  friendlyName: 'Search',
  description: 'Search item',
  fn: async function () {
    let req = this.req;
    let params = req.allParams();
    let query = req.query;
    let model = params.model;
    return await sails.models[model].find(query).populateAll();
  }
};
