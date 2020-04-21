module.exports = {
  friendlyName: 'Unregister',
  description: 'Unregister hosts from this group.',
  fn: async function () {
    let req = this.req,
      res = this.res,
      params = req.allParams(),
      id = params.id,
      hosts = params.hosts;
    await Group.removeFromCollection(id, 'hosts', hosts);
    return await Group.findOne({id}).populateAll();
  }
};
