/**
 * Workflow.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */
module.exports = {
  attributes: {
    title: {
      type: 'string',
      required: true
    },
    description: {
      type: 'string'
    },
    state: {
      type: 'number',
      isInteger: true,
      defaultsTo: 0
    },
    tasks: {
      collection: 'task',
      via: 'workflow'
    },
    host: {
      model: 'host'
    }
  }
};
