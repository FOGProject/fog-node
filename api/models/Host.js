/**
 * Host.js
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
    description: {
      type: 'string'
    },
    guid: {
      type: 'string',
      isUUID: true,
      unique: true
    },
    macs: {
      type: 'json'
    },
    image: {
      model: 'image'
    },
    groups: {
      collection: 'group',
      via: 'hosts'
    },
    workflows: {
      collection: 'workflow',
      via: 'host'
    }
  }
};
