module.exports = {
  friendlyName: 'Register',
  description: 'Register hosts to this group.',
  fn: async function () {
    let req = this.req,
      res = this.res,
      params = req.allParams(),
      id = params.id,
      hosts = params.hosts;
    await Group.addToCollection(id, 'hosts', hosts);
    return await Group.findOne({id}).populateAll();
  }
};
