/**
 * StorageNode.js
 *
 * @description :: A storage node (member) within a storage group. Mirrors FOG
 *                 1.x `nfsGroupMembers`.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */
module.exports = {
  attributes: {
    name: {
      type: 'string'
    },
    description: {
      type: 'string'
    },
    isMaster: {
      type: 'boolean',
      defaultsTo: false
    },
    isEnabled: {
      type: 'boolean',
      defaultsTo: true
    },
    isGraphEnabled: {
      type: 'boolean',
      defaultsTo: true
    },
    ip: {
      type: 'string',
      required: true
    },
    path: {
      type: 'string',
      required: true
    },
    ftppath: {
      type: 'string'
    },
    snapinpath: {
      type: 'string'
    },
    sslpath: {
      type: 'string'
    },
    webroot: {
      type: 'string'
    },
    user: {
      type: 'string'
    },
    pass: {
      type: 'string'
    },
    key: {
      type: 'string'
    },
    interface: {
      type: 'string'
    },
    maxClients: {
      type: 'number',
      isInteger: true,
      min: 0,
      defaultsTo: 10
    },
    bitrate: {
      type: 'string'
    },
    bandwidth: {
      type: 'string'
    },
    helloInterval: {
      type: 'number',
      isInteger: true,
      min: 0,
      defaultsTo: 10
    },
    graphcolor: {
      type: 'string'
    },
    storagegroup: {
      model: 'storagegroup'
    }
  }
};
