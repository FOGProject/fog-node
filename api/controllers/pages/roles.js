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
      theads: [
        'Name',
        'Description'
      ],
      content: roles,
      title: 'Role List'
    };
  }
};
