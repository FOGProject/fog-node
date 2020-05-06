module.exports = {
  friendlyName: 'Groups',
  description: 'Groups pages.',
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
      header: 'Group List',
      theads: [
        'Name',
        'Description'
      ],
      model: 'group',
      title: 'Group List'
    };
  }
};
