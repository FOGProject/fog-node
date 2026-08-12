module.exports = {
  friendlyName: 'List',
  description: 'List Items.',
  fn: async function () {
    let req = this.req;
    let res = this.res;
    let params = req.allParams();
    let model = params.model;
    return await sails.models[model].find().populateAll();
  }
};
