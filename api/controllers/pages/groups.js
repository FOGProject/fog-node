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
      res = this.res,
      groups = await Group.find().populateAll();
    return {
      items: groups,
      header: 'Group List',
      content: groups,
      title: 'Group List'
    };
  }
};
