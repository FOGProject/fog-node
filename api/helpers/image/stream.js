const path = require('path'),
  fs = require('fs'),
  progress = require('progress-stream'),
  imageDir = path.join(__dirname, '..', '..', '..', 'images');
module.exports = {
  friendlyName: 'Stream',
  description: 'Stream image.',
  inputs: {
    id: {
      friendlyName: 'Image ID',
      description: 'The Image objects ID',
      type: 'string',
      required: true
    },
    partition: {
      friendlyName: 'Partition',
      description: 'The image partition and disk we are working with',
      type: 'string',
      required: true
    },
    target: {
      friendlyName: 'Target',
      description: 'Where are we sending the stream?',
      type: 'string',
      required: true
    }
  },
  exits: {
    error: {
      description: 'An error has occurred'
    },
    invalid: {
      description: 'Image not found',
    },
    success: {
      description: 'All done.',
    },
  },
  fn: async function (inputs, exits) {
    let id = inputs.id,
      partition = inputs.partition,
      target = inputs.target;
    await sails.helpers.image.aquireReadLock(id).switch({
      error: async (err) => {
        return exits.error(err);
      },
      invalid: async (err) => {
        return exits.invalid(err);
      },
      success: (image) => {
        let partitionPath = path.join(imageDir, id, `${partition}.img`);
        sails.log.info(`Reading: ${partitionPath}`);
        fs.exists(partitionPath, (err, exists) => {
          if (err) return exits.error(err);
          if (!exists) return exits.invalid('Partition file does not exist');
          fs.stat(partitionPath, (err, stat) => {
            if (err) return exits.error(err);
            if (!stat) return exits.invalid('Cannot get status of file');
            let stream = fs.createReadStream(partitionPath),
              progressStream = progress({length: stat.size, time: 100});
            stream.on('error', (err) => {
              if (err) return exits.error(err);
            });
            progressStream.on('progress', (progress) => {
              sails.log.info(progress);
            });
            stream.pipe(progressStream).pipe(target);
          });
        });
      }
    });
  }
};
