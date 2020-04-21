module.exports = {
  friendlyName: 'Assign',
  description: 'Assign users to this role.',
  fn: async function () {
    let req = this.req,
      res = this.res,
      params = req.allParams(),
      id = params.id,
      users = params.users;
    await Role.addToCollection(id, 'users', users);
    return await Role.findOne({id}).populateAll();
  }
};
