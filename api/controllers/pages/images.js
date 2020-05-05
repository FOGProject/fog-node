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
      res = this.res,
      images = await Image.find().populateAll();
    return {
      items: images,
      header: 'Image List',
      theads: [
        'Name',
        'Path'
      ],
      content: images,
      title: 'Image List'
    };
  }
};
