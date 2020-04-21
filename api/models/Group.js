/**
 * Group.js
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
    priority: {
      type: 'number',
      min: 0,
      isInteger: true,
      defaultsTo: 0
    },
    hosts: {
      collection: 'host',
      via: 'groups',
      dominant: true
    },
    image: {
      model: 'image'
    }
  }
};
