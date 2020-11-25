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
    hosts: {
      collection: 'host',
      via: 'image'
    },
    groups: {
      collection: 'group',
      via: 'image'
    }
  }
};
