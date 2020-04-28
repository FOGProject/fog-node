module.exports = {
  friendlyName: 'Destroy',
  description: 'Destroy user.',
  fn: async function () {
    let req = this.req,
      res = this.res,
      params = req.allParams(),
      id = params.id,
      model = params.model;
    if (!Array.isArray(id)) {
      id = [id];
    }
    return await sails.models[model].destroy({id}).fetch();
  }
};
