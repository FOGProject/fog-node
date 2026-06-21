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
    let destroyed = await sails.models[model].destroy({id}).fetch();
    // Cascade: let plugins remove their host-linked records.
    if (model === 'host' && sails.plugins && sails.plugins.hostDestroy) {
      for (let hid of id) {
        await sails.plugins.hostDestroy(hid);
      }
    }
    return destroyed;
  }
};
