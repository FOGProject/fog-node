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
      res = this.res;
    return {
      header: 'Host List',
      theads: [
        'Name',
        'Description'
      ],
      model: 'host',
      title: 'Host List'
    };
  }
};
