module.exports = {
  friendlyName: 'Unassign',
  description: 'Unassign users from this role.',
  fn: async function () {
    let req = this.req,
      res = this.res,
      params = req.allParams(),
      id = params.id,
      users = params.users;
    await Role.removeFromCollection(id, 'users', users);
    return await Role.findOne({id}).populateAll();
  }
};
