module.exports = {
  friendlyName: 'Images',
  description: 'Images pages.',
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
      header: 'Image List',
      theads: [
        'Name',
        'Path'
      ],
      model: 'image',
      title: 'Image List'
    };
  }
};
