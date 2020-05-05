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
      res = this.res,
      workflows = await Workflow.find().populateAll();
    return {
      items: workflows,
      header: 'Workflow List',
      theads: [
        'Name',
        'Description'
      ],
      content: workflows,
      title: 'Workflow List'
    };
  }
};
