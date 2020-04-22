module.exports = {
  friendlyName: 'Capture',
  description: 'Capture image.',
  exits: {
    error: {
      description: 'An error occurred',
      responseType: 'serverError'
    },
    invalid: {
      description: 'Invalid request',
      responseType: 'badRequest'
    },
    success: {
      description: 'Stream started'
    }
  },
  fn: async function (inputs, exits) {
    let req = this.req,
      res = this.res,
      params = req.allParams(),
      id = params.id;
    res.setTimeout(0);
    await req.file('image').upload({}, async function whenDone(err, uploadedFiles) {
      if (err) return exits.error(err);
      return exits.success({
        files: uploadedFiles,
        textParams: params
      });
    });
  }
};
