module.exports = {
  friendlyName: 'Assign',
  description: 'Assign users to this role.',
  fn: async function () {
    let req = this.req;
    let res = this.res;
    let params = req.allParams();
    let id = params.id;
    let users = params.users;
    await Role.addToCollection(id, 'users', users);
    return await Role.findOne({id}).populateAll();
  }
};
