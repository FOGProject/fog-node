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
      res = this.res,
      tasks = await Task.find().populateAll();
    return {
      items: tasks,
      header: 'Task List',
      content: tasks,
      title: 'Task List'
    };
  }
};
