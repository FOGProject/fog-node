module.exports = {
  friendlyName: 'Hosts',
  description: 'Hosts pages.',
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
      hosts = await Host.find().populateAll();
    return {
      items: hosts,
      header: 'Host List',
      content: hosts,
      title: 'Host List'
    };
  }
};
