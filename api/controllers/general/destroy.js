module.exports = {
  friendlyName: 'Destroy',
  description: 'Destroy user.',
  fn: async function () {
    let req = this.req;
    let params = req.allParams();
    let id = params.id;
    let model = params.model;
    if (!Array.isArray(id)) {
      id = [id];
    }
    let destroyed = await sails.models[model].destroy({id}).fetch();
    // A destroyed Group leaves its members: the name goes from each host's
    // groups, and no host is deleted.
    if (model === 'group') {
      for (let group of destroyed) {
        await sails.helpers.group.remove.with({name: group.name});
        // Cascade: the plugins delete the group's grant rows.
        if (sails.plugins && sails.plugins.groupDestroy) {
          await sails.plugins.groupDestroy(group.id);
        }
      }
    }
    // Cascade: let plugins remove their host-linked records.
    if (model === 'host' && sails.plugins && sails.plugins.hostDestroy) {
      for (let hid of id) {
        await sails.plugins.hostDestroy(hid);
      }
    }
    return destroyed;
  }
};
