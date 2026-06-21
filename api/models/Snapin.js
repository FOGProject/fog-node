/**
 * Snapin.js
 *
 * @description :: A deployable software package / script. Mirrors FOG 1.x
 *                 `snapins`. (The sidebar currently labels these "Modules".)
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
    file: {
      type: 'string'
    },
    args: {
      type: 'string'
    },
    reboot: {
      type: 'boolean',
      defaultsTo: false
    },
    shutdown: {
      type: 'boolean',
      defaultsTo: false
    },
    runWith: {
      type: 'string'
    },
    runWithArgs: {
      type: 'string'
    },
    protected: {
      type: 'boolean',
      defaultsTo: false
    },
    isEnabled: {
      type: 'boolean',
      defaultsTo: true
    },
    toReplicate: {
      type: 'boolean',
      defaultsTo: true
    },
    hide: {
      type: 'boolean',
      defaultsTo: false
    },
    timeout: {
      type: 'number',
      isInteger: true,
      min: 0,
      defaultsTo: 0
    },
    packtype: {
      type: 'number',
      isInteger: true,
      defaultsTo: 0
    },
    hash: {
      type: 'string'
    },
    size: {
      type: 'string'
    },
    createdBy: {
      type: 'string'
    },
    hosts: {
      collection: 'host',
      via: 'snapins'
    }
  }
};
