/**
 * Image.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */
module.exports = {
  attributes: {
    name: {
      type: 'string',
      required: true,
      unique: true
    },
    protected: {
      type: 'boolean',
      defaultsTo: false
    },
    enabled: {
      type: 'boolean',
      defaultsTo: true
    },
    description: {
      type: 'string'
    },
    writeLock: {
      type: 'boolean',
      defaultsTo: false
    },
    readers: {
      type: 'number',
      isInteger: true,
      min: 0,
      defaultsTo: 0
    },
    lastCaptureDate: {
      type: 'string',
      columnType: 'datetime'
    },
    // --- FOG 1.x `images` scalar fields. The lookup FKs (imageType,
    //     imagePartitionType, os) are kept as numeric ids for now; dedicated
    //     ImageType/PartitionType/OS models can replace them later. ---
    path: {
      type: 'string'
    },
    createdBy: {
      type: 'string'
    },
    building: {
      type: 'number',
      isInteger: true,
      defaultsTo: 0
    },
    size: {
      type: 'string'
    },
    srvsize: {
      type: 'string'
    },
    imageType: {
      type: 'number',
      isInteger: true
    },
    imagePartitionType: {
      type: 'number',
      isInteger: true
    },
    os: {
      type: 'number',
      isInteger: true
    },
    deployed: {
      type: 'string'
    },
    format: {
      type: 'number',
      isInteger: true
    },
    magnet: {
      type: 'string'
    },
    compress: {
      type: 'number',
      isInteger: true
    },
    toReplicate: {
      type: 'boolean',
      defaultsTo: true
    },
    hosts: {
      collection: 'host',
      via: 'image'
    }
  }
};
