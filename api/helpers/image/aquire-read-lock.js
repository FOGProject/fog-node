const ObjectId = require('mongodb').ObjectID;
module.exports = {
  friendlyName: 'Aquire read lock',
  description: 'Sets and gets the read lock on an image',
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
    let id = inputs.id,
      db = Image.getDatastore().manager;
    await db.collection(Image.tableName).update({_id: new ObjectId(id), writeLock: false}, {$inc: {readers: 1}}, async (err, image) => {
      if (err) return exits.error(err);
      if (!image) return exits.invalid('Image not found');
      return exits.success(image);
    });
  }
};
