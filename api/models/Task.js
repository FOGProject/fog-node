/**
 * Task.js
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
    runner: {
      type: 'string',
      defaultsTo: 'server'
    },
    subRunner: {
      type: 'string'
    },
    state: {
      type: 'number',
      isInteger: true,
      defaultsTo: 0
    },
    payload: {
      type: 'json',
      required: true
    },
    workflow: {
      model: 'workflow',
      required: true
    },
    progress: {
      type: 'number',
      defaultsTo: 0
    },
    progressText: {
      type: 'string',
      defaultsTo: ''
    },
    startTime: {
      type: 'ref'
    },
    completionTime: {
      type: 'ref'
    }
  }
};
