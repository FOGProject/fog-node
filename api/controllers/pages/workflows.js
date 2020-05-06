module.exports = {
  friendlyName: 'Workflows',
  description: 'Workflows pages.',
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
      header: 'Workflow List',
      theads: [
        'Name',
        'Description'
      ],
      model: 'workflow',
      title: 'Workflow List'
    };
  }
};
