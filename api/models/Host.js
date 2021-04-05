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
      maxLength: 63,
      regex: /^[a-z\d]([a-z\d\-]{0,61}[a-z\d])?(\.[a-z\d]([a-z\d\-]{0,61}[a-z\d])?)*$/i,
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
