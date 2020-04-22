module.exports = {
  friendlyName: 'Release write lock',
  description: 'Releases write lock on an image',
  inputs: {
    id: {
      friendlyName: 'Image ID',
      description: 'The Image objects ID',
      type: 'string',
      required: true
    }
  },
  exits: {
    error: {
      description: 'An error occurred'
    },
    invalid: {
      description: 'Invalid'
    },
    success: {
      description: 'All done.',
    },
  },
  fn: async function (inputs, exits) {
    let id = inputs.id;
    await Image.updateOne({id: id},{writeLock: false}, async (err, image) => {
      if (err) return exits.error(err);
      if (!image) return exits.invalid('Image not found');
      return exits.success(image);
    });
  }
};
