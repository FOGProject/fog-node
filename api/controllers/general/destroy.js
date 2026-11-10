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
    // The audit trail (api/hooks/audit): one row for the request. One id names
    // the row; several ids give the count, with no subject id.
    if (id.length > 1) {
      sails.helpers.audit.subject(req, model);
      req.audit.affectedCount = destroyed.length;
    } else {
      sails.helpers.audit.subject(req, model, destroyed[0], id[0]);
    }
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
