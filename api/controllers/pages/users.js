module.exports = {
  friendlyName: 'Users',
  description: 'Users pages.',
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
      header: 'User List',
      theads: [
        'Display Name',
        'Username',
        'Email'
      ],
      model: 'user',
      title: 'User List'
    };
  }
};
