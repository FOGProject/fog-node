module.exports = {
  friendlyName: 'Roles',
  description: 'Roles pages.',
  inputs: {
  },
  exits: {
    error: {
      responseType: 'serverError'
    },
    success: {
      viewTemplatePath: 'pages/list',
      description: 'Successful'
    }
  },
  fn: async function (inputs) {
    let req = this.req,
      res = this.res,
      roles = await Role.find().populateAll();
    return {
      items: roles,
      header: 'Role List',
      content: roles,
      title: 'Role List'
    };
  }
};
