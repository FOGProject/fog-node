module.exports = {
  friendlyName: 'Deploy',
  description: 'Deploy image.',
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
      id = params.id,
      partition = params.partition;
    await sails.helpers.image.stream(id, partition, res).switch({
      error: async (err) => {
        return exits.error(err);
      },
      invalid: async (err) => {
        return exits.invalid(err);
      },
      success: async () => {
        return exits.success();
      }
    });
  }
};
