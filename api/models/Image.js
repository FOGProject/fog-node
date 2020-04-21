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
