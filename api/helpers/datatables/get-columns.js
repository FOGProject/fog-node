module.exports = {
  friendlyName: 'Get columns',
  description: '',
  inputs: {
    req: {
      friendlyName: 'Request',
      description: 'A reference to the request object (req)',
      type: 'ref',
      required: true
    },
    res: {
      friendlyName: 'Response',
      description: 'A reference to the response object (res)',
      type: 'ref'
    }
  },
  exits: {
    success: {
      outputFriendlyName: 'Columns',
    }
  },
  fn: async function (inputs) {
    let req = inputs.req,
      res = inputs.res,
      params = req.allParams(),
      model = params.model;

    if (!model || !sails.models[model]) {
      return {
        error: `Model: ${model} does not exist`
      };
    }

    // Set the model object
    model = sails.models[model];

    let columns = Object.keys(model.attributes);

    return {columns};
  }
};
