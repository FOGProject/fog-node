module.exports = {
  friendlyName: 'Find',
  description: 'Find user.',
  fn: async function () {
    let req = this.req;
    let res = this.res;
    let params = req.allParams();
    let model = params.model;
    let id = params.id;
    return await sails.models[model].findOne({id}).populateAll();
  }
};
