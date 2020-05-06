module.exports = {
  friendlyName: 'Tasks',
  description: 'Tasks pages.',
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
      header: 'Task List',
      theads: [
        'Name'
      ],
      model: 'task',
      title: 'Task List'
    };
  }
};
