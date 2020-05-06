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
      res = this.res;
    return {
      header: 'Role List',
      theads: [
        'Name',
        'Description'
      ],
      model: 'role',
      title: 'Role List'
    };
  }
};
