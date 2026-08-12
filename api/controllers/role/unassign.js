module.exports = {
  friendlyName: 'Unassign',
  description: 'Unassign users from this role.',
  fn: async function () {
    let req = this.req;
    let res = this.res;
    let params = req.allParams();
    let id = params.id;
    let users = params.users;
    await Role.removeFromCollection(id, 'users', users);
    return await Role.findOne({id}).populateAll();
  }
};
